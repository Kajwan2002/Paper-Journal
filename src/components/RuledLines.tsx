import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  cycleKind,
  glyphFor,
  groupRangeOf,
  isStruck,
  isTaskKind,
  newLine,
  parseLine,
  reorderGroup,
  type Line,
} from "@/lib/rapidlog";
import { parseDue } from "@/lib/nldate";
import { toggleStruck } from "@/lib/tick";
import { moveLineTo } from "@/lib/schedule";
import { relativeDay, todayKey, type DayKey } from "@/lib/date";
import { deadlineShort, urgencyOf } from "@/lib/deadline";
import { NAG_CAP } from "@/lib/rollover";
import { useQuickAdd } from "@/state/quickadd";
import { LineMenu } from "@/components/LineMenu";
import "./ruled-lines.css";

interface Props {
  lines: Line[];
  onChange: (lines: Line[]) => void;
  /** the day these lines are written on — the anchor for "friday" */
  date: DayKey;
  /** which notebook, so a strike can follow the line back through the days
   *  it was carried across */
  notebookId: string;
  placeholder?: string;
}

export function RuledLines({
  lines,
  onChange,
  date,
  notebookId,
  placeholder,
}: Props) {
  const inputs = useRef<Map<string, HTMLInputElement>>(new Map());
  /** the line to put the caret on after the next render — a ref rather than
   *  state so asking for focus never costs an extra render pass */
  const wantFocus = useRef<string | null>(null);
  const setFocusId = (id: string) => {
    wantFocus.current = id;
  };
  const [menu, setMenu] = useState<{ id: string; anchor: DOMRect } | null>(
    null,
  );

  // One stable blank row for whenever there's nothing open to type on — a
  // truly untouched page, or one where every line has been parked in
  // someday (it lives in Open Loops until it's picked back up, so the page
  // it happens to sit on reads as if it were never written). Minting a
  // fresh line (and a fresh id) inline on every render remounted the
  // <input> whenever anything above re-rendered, which on a phone meant the
  // keyboard opening resized the viewport, remounted the field, and
  // dismissed the keyboard again.
  //
  // Unlike a plain empty page, "nothing open" can be entered and left any
  // number of times over the page's life — park the last task, write a new
  // one, park that one too — so this can't be a single id fixed for good
  // the first time it's needed. State that remembers whether the *previous*
  // render had something open, and mints a fresh line only on the render
  // where that flips to false, keeps the id stable while the row is showing
  // but never reuses one already adopted by an actual line — reusing it
  // would mean a second real line silently sharing an id with (and
  // overwriting) whichever one adopted it first. Comparing against state
  // rather than a ref, and correcting it inline during render, is the
  // supported way to derive this without an extra render's flash of
  // nothing between "parked" and the fallback row appearing.
  const open = lines.filter((l) => !l.someday);
  const isOpen = open.length > 0;
  const [blank, setBlank] = useState(() => ({ isOpen, line: newLine() }));
  if (isOpen !== blank.isOpen) {
    setBlank({ isOpen, line: isOpen ? blank.line : newLine() });
  }
  const rows = isOpen ? lines : [...lines, blank.line];
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  });
  const visible = rows.filter((l) => !l.someday);

  const commit = useCallback(
    (next: Line[]) => onChange(next.length > 0 ? next : [newLine()]),
    [onChange],
  );

  useEffect(() => {
    const id = wantFocus.current;
    if (!id) return;
    wantFocus.current = null;
    const el = inputs.current.get(id);
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  });

  // --- quick-add tray ---------------------------------------------------
  const pending = useQuickAdd((s) => s.pending);
  const consume = useQuickAdd((s) => s.consume);
  useEffect(() => {
    if (!pending) return;
    const base = [...rowsRef.current];
    while (base.length && base[base.length - 1].text.trim() === "") base.pop();
    const created = newLine(
      pending.kind,
      "",
      base[base.length - 1]?.indent ?? 0,
    );
    onChange([...base, created]);
    setFocusId(created.id);
    consume();
  }, [pending, onChange, consume]);

  // --- editing --------------------------------------------------------
  const patch = useCallback(
    (id: string, change: (line: Line) => Line) => {
      commit(rowsRef.current.map((l) => (l.id === id ? change(l) : l)));
    },
    [commit],
  );

  /** Tap the signifier: toggle this copy — cascading onto any indented
   *  lines gathered under it — and carry each changed one back through
   *  every day it was migrated across, so a week read backwards shows what
   *  was actually finished. Shared with Open Loops and the coming-up note,
   *  so ticking something off means the same thing everywhere it appears. */
  const strike = useCallback(
    (id: string) => {
      const before = rowsRef.current.find((l) => l.id === id);
      if (!before) return;
      void toggleStruck(notebookId, date, before);
    },
    [notebookId, date],
  );

  const editText = (id: string, raw: string) => {
    const idx = rows.findIndex((l) => l.id === id);
    if (idx < 0) return;
    const current = rows[idx];
    const parsed = parseLine(raw);
    const gotPrefix = parsed.text !== raw;
    const next = [...rows];
    next[idx] = {
      ...current,
      kind: gotPrefix ? parsed.kind : current.kind,
      text: parsed.text,
      struck:
        gotPrefix && parsed.struck !== undefined
          ? parsed.struck
          : current.struck,
      rolls:
        current.rolls && parsed.text.trim() !== current.text.trim()
          ? 0
          : current.rolls,
    };
    commit(next);
  };

  /** Read a trailing "friday" off a task and file it — on commit only, so
   *  the text never rearranges itself under the cursor mid-word. */
  const settleLine = (id: string) => {
    const line = rowsRef.current.find((l) => l.id === id);
    if (!line || !isTaskKind(line) || line.carriedTo || line.someday) return;
    const { text, due } = parseDue(line.text, date);
    if (!due) return;
    // strip the date word first, then file the line onto that day
    const named = { ...line, text };
    patch(id, () => named);
    void moveLineTo(notebookId, date, named, due);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>, id: string) => {
    // navigation moves between what's actually on screen — a hidden
    // someday line between two visible ones shouldn't be reachable by
    // arrowing past it, or count as "the line before" for any of these
    const idx = visible.findIndex((l) => l.id === id);
    if (idx < 0) return;

    // Tick a task off without leaving the keyboard. Checked before plain
    // Enter, which would otherwise swallow the chord and open a new line.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      strike(id);
      return;
    }

    // Cycle the line's type — task, priority, event, idea, note, and back —
    // without reaching for the mouse. A breadcrumb isn't really any kind any
    // more, so it's left alone, same as the line menu hides the picker for it.
    if (e.key === "Enter" && e.altKey) {
      e.preventDefault();
      const line = visible[idx];
      if (!line.carriedTo) {
        patch(id, (l) => ({
          ...l,
          kind: cycleKind(l.kind === "done" ? "task" : l.kind),
        }));
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      settleLine(id);
      const prev = visible[idx];
      const created = newLine(
        prev.kind === "task" ? "task" : "note",
        "",
        prev.indent ?? 0,
      );
      const next = [...rowsRef.current];
      const at = next.findIndex((l) => l.id === id);
      next.splice(at + 1, 0, created);
      commit(next);
      setFocusId(created.id);
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const indent: 0 | 1 = e.shiftKey ? 0 : 1;
      const next = [...rows];
      const at = next.findIndex((l) => l.id === id);
      next[at] = { ...next[at], indent };
      commit(next);
      setFocusId(id);
      return;
    }

    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      const to = e.key === "ArrowUp" ? idx - 1 : idx + 1;
      if (to < 0 || to >= visible.length) return;
      e.preventDefault();
      const next = [...rows];
      const from = next.findIndex((l) => l.id === id);
      const at = next.findIndex((l) => l.id === visible[to].id);
      [next[from], next[at]] = [next[at], next[from]];
      commit(next);
      setFocusId(id);
      return;
    }

    if (
      e.key === "Backspace" &&
      visible[idx].text === "" &&
      visible.length > 1
    ) {
      e.preventDefault();
      commit(rows.filter((l) => l.id !== id));
      const before = visible[idx - 1];
      if (before) setFocusId(before.id);
      return;
    }

    if (e.key === "ArrowUp" && idx > 0) {
      e.preventDefault();
      setFocusId(visible[idx - 1].id);
    }
    if (e.key === "ArrowDown" && idx < visible.length - 1) {
      e.preventDefault();
      setFocusId(visible[idx + 1].id);
    }
  };

  const removeLine = (id: string) => {
    const idx = visible.findIndex((l) => l.id === id);
    commit(rowsRef.current.filter((l) => l.id !== id));
    const before = visible[idx - 1];
    if (before) setFocusId(before.id);
    setMenu(null);
  };

  // --- drag to reorder ----------------------------------------------
  const [drag, setDrag] = useState<{ id: string; dy: number } | null>(null);
  const anchor = useRef({ y: 0, rowH: 33 });
  // the drag also lives in a ref, read synchronously by the next pointer
  // event. It used to be read inside a `setDrag` updater, which meant the
  // page write that a crossed row triggers happened during React's render
  // phase — warned about, and run twice over in StrictMode.
  const dragging = useRef<{ id: string; dy: number } | null>(null);
  const moveDrag = (next: { id: string; dy: number } | null) => {
    dragging.current = next;
    setDrag(next);
  };

  const onGripDown = (e: ReactPointerEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rowEl = (e.currentTarget as HTMLElement).closest(".ruled__row");
    anchor.current = {
      y: e.clientY,
      rowH: rowEl?.getBoundingClientRect().height ?? 33,
    };
    moveDrag({ id, dy: 0 });
  };

  const onGripMove = (e: ReactPointerEvent) => {
    const d = dragging.current;
    if (!d) return;
    const list = rowsRef.current;
    // the grip only exists on visible rows, and each row-height step of
    // drag distance corresponds to a visible neighbour, not necessarily
    // the next slot in the full (someday-including) array
    const shown = list.filter((l) => !l.someday);
    const cur = shown.findIndex((l) => l.id === d.id);
    if (cur < 0) return;
    const raw = e.clientY - anchor.current.y;
    const steps = Math.round(raw / anchor.current.rowH);
    const target = Math.max(0, Math.min(shown.length - 1, cur + steps));
    if (target !== cur) {
      const from = list.findIndex((l) => l.id === d.id);
      const to = list.findIndex((l) => l.id === shown[target].id);
      const moved = reorderGroup(list, from, to);
      if (moved !== list) {
        commit(moved);
        // re-anchor by the rows the pointer actually travelled, not by
        // where the block came to rest. A group refusing to split another
        // one can land further than it was asked to, and charging the
        // pointer for that difference leaves a `dy` that immediately asks
        // to move it back — the two fight each other for the rest of the
        // drag and it ends up where it started.
        anchor.current.y += (target - cur) * anchor.current.rowH;
        moveDrag({ id: d.id, dy: e.clientY - anchor.current.y });
        return;
      }
    }
    moveDrag({ id: d.id, dy: raw });
  };

  const onGripUp = (e: ReactPointerEvent) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    moveDrag(null);
  };

  const pageEmpty = visible.length === 1 && visible[0].text === "";
  const today = todayKey();

  // a line being dragged carries its list under it, so the whole group has
  // to travel under the finger rather than the heading sliding out of it
  const dragGroup = new Set<string>();
  if (drag) {
    const at = visible.findIndex((l) => l.id === drag.id);
    if (at >= 0) {
      const [start, end] = groupRangeOf(visible, at);
      for (const l of visible.slice(start, end)) dragGroup.add(l.id);
    }
  }

  return (
    <div className="ruled">
      {visible.map((line) => {
        const struck = isStruck(line);
        const overdue = !!line.due && line.due < today && !struck;
        return (
          <div
            key={line.id}
            className={`ruled__row ruled__row--${line.kind} ${
              dragGroup.has(line.id) ? "ruled__row--drag" : ""
            } ${menu?.id === line.id ? "ruled__row--menu" : ""}`}
            data-indent={line.indent ?? 0}
            data-rolls={Math.min(line.rolls ?? 0, NAG_CAP)}
            data-struck={struck ? "1" : "0"}
            style={
              drag && dragGroup.has(line.id)
                ? { transform: `translateY(${drag.dy}px)`, zIndex: 5 }
                : undefined
            }
          >
            <button
              type="button"
              className="ruled__glyph"
              aria-pressed={struck}
              aria-label={
                struck
                  ? `Not done: ${line.text || "empty line"}`
                  : `Mark done: ${line.text || "empty line"}`
              }
              onClick={() => strike(line.id)}
            >
              {glyphFor(line)}
            </button>

            <input
              ref={(el) => {
                if (el) inputs.current.set(line.id, el);
                else inputs.current.delete(line.id);
              }}
              className="ruled__input"
              value={line.text}
              spellCheck={false}
              autoComplete="off"
              aria-label="Line"
              onChange={(e) => editText(line.id, e.target.value)}
              onKeyDown={(e) => onKey(e, line.id)}
              onBlur={() => settleLine(line.id)}
            />

            {line.deadline && !struck ? (
              <span
                className={`ruled__chip ruled__chip--by ruled__chip--${urgencyOf(
                  line.deadline,
                  today,
                )}`}
              >
                {deadlineShort(line.deadline, today)}
              </span>
            ) : line.carriedTo ? (
              // a breadcrumb: the useful fact is where it went, and its old
              // `due` would read as a date that has long since passed
              <span className="ruled__chip ruled__chip--moved">
                → {relativeDay(line.carriedTo, today)}
              </span>
            ) : line.due ? (
              <span
                className={`ruled__chip ${overdue ? "ruled__chip--late" : ""}`}
              >
                {relativeDay(line.due, today)}
              </span>
            ) : null}

            <span className="ruled__strike" aria-hidden="true" />

            <div className="ruled__tools">
              <button
                type="button"
                className="ruled__tool"
                aria-label={`Options for: ${line.text || "empty line"}`}
                aria-haspopup="menu"
                aria-expanded={menu?.id === line.id}
                onClick={(e) => {
                  // Measure now, not inside the updater. React nulls out
                  // `currentTarget` once the handler returns, and it only
                  // runs an updater eagerly while the fiber has no pending
                  // work — so this read succeeded on the first open and
                  // threw on every one after it, taking the whole app down.
                  const anchor = e.currentTarget.getBoundingClientRect();
                  setMenu((m) =>
                    m?.id === line.id ? null : { id: line.id, anchor },
                  );
                }}
              >
                ⋯
              </button>
              {visible.length > 1 ? (
                <button
                  type="button"
                  className="ruled__grip"
                  tabIndex={-1}
                  aria-hidden="true"
                  onPointerDown={(e) => onGripDown(e, line.id)}
                  onPointerMove={onGripMove}
                  onPointerUp={onGripUp}
                  onPointerCancel={onGripUp}
                >
                  ⠿
                </button>
              ) : null}
            </div>

            {menu?.id === line.id ? (
              <LineMenu
                line={line}
                date={date}
                anchor={menu.anchor}
                onClose={() => setMenu(null)}
                onPatch={(change) => {
                  patch(line.id, change);
                  setMenu(null);
                }}
                onMove={(day) => {
                  setMenu(null);
                  void moveLineTo(notebookId, date, line, day);
                }}
                onDelete={() => removeLine(line.id)}
              />
            ) : null}
          </div>
        );
      })}

      {pageEmpty && placeholder ? (
        <p className="ruled__placeholder" aria-hidden="true">
          {placeholder}
        </p>
      ) : null}
    </div>
  );
}
