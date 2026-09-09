import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  glyphFor,
  isStruck,
  newLine,
  parseLine,
  tapSignifier,
  type Line,
} from "@/lib/rapidlog";
import { NAG_CAP } from "@/lib/rollover";
import { useQuickAdd } from "@/state/quickadd";
import "./ruled-lines.css";

interface Props {
  lines: Line[];
  onChange: (lines: Line[]) => void;
  placeholder?: string;
}

export function RuledLines({ lines, onChange, placeholder }: Props) {
  const inputs = useRef<Map<string, HTMLInputElement>>(new Map());
  const listRef = useRef<HTMLDivElement>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  const rows = lines.length > 0 ? lines : [newLine()];
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const commit = useCallback(
    (next: Line[]) => onChange(next.length > 0 ? next : [newLine()]),
    [onChange],
  );

  useEffect(() => {
    if (!focusId) return;
    const el = inputs.current.get(focusId);
    el?.focus();
    const v = el?.value ?? "";
    el?.setSelectionRange(v.length, v.length);
    setFocusId(null);
  }, [focusId]);

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

  const onKey = (e: KeyboardEvent<HTMLInputElement>, id: string) => {
    const idx = rows.findIndex((l) => l.id === id);
    if (idx < 0) return;

    if (e.key === "Enter") {
      e.preventDefault();
      const prev = rows[idx];
      const created = newLine(
        prev.kind === "task" ? "task" : "note",
        "",
        prev.indent ?? 0,
      );
      const next = [...rows];
      next.splice(idx + 1, 0, created);
      commit(next);
      setFocusId(created.id);
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const indent: 0 | 1 = e.shiftKey ? 0 : 1;
      const next = [...rows];
      next[idx] = { ...next[idx], indent };
      commit(next);
      setFocusId(id);
      return;
    }

    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      const to = e.key === "ArrowUp" ? idx - 1 : idx + 1;
      if (to < 0 || to >= rows.length) return;
      e.preventDefault();
      const next = [...rows];
      [next[idx], next[to]] = [next[to], next[idx]];
      commit(next);
      setFocusId(id);
      return;
    }

    if (e.key === "Backspace" && rows[idx].text === "" && rows.length > 1) {
      e.preventDefault();
      commit(rows.filter((l) => l.id !== id));
      const before = rows[idx - 1];
      if (before) setFocusId(before.id);
    }

    if (e.key === "ArrowUp" && idx > 0) {
      e.preventDefault();
      setFocusId(rows[idx - 1].id);
    }
    if (e.key === "ArrowDown" && idx < rows.length - 1) {
      e.preventDefault();
      setFocusId(rows[idx + 1].id);
    }
  };

  const tap = (id: string) =>
    commit(rows.map((l) => (l.id === id ? tapSignifier(l) : l)));

  // --- drag to reorder ----------------------------------------------
  const [drag, setDrag] = useState<{ id: string; dy: number } | null>(null);
  const anchor = useRef({ y: 0, rowH: 33 });

  const onGripDown = (e: ReactPointerEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rowEl = (e.currentTarget as HTMLElement).closest(".ruled__row");
    anchor.current = {
      y: e.clientY,
      rowH: rowEl?.getBoundingClientRect().height ?? 33,
    };
    setDrag({ id, dy: 0 });
  };

  const onGripMove = (e: ReactPointerEvent) => {
    setDrag((d) => {
      if (!d) return d;
      const list = rowsRef.current;
      const cur = list.findIndex((l) => l.id === d.id);
      if (cur < 0) return d;
      const raw = e.clientY - anchor.current.y;
      const steps = Math.round(raw / anchor.current.rowH);
      const target = Math.max(0, Math.min(list.length - 1, cur + steps));
      if (target !== cur) {
        const next = [...list];
        const [moved] = next.splice(cur, 1);
        next.splice(target, 0, moved);
        commit(next);
        anchor.current.y += (target - cur) * anchor.current.rowH;
        return { id: d.id, dy: e.clientY - anchor.current.y };
      }
      return { id: d.id, dy: raw };
    });
  };

  const onGripUp = (e: ReactPointerEvent) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setDrag(null);
  };

  const pageEmpty = rows.length === 1 && rows[0].text === "";

  return (
    <div className="ruled" ref={listRef}>
      {rows.map((line) => (
        <div
          key={line.id}
          className={`ruled__row ruled__row--${line.kind} ${
            drag?.id === line.id ? "ruled__row--drag" : ""
          }`}
          data-indent={line.indent ?? 0}
          data-rolls={Math.min(line.rolls ?? 0, NAG_CAP)}
          data-struck={isStruck(line) ? "1" : "0"}
          style={
            drag?.id === line.id
              ? { transform: `translateY(${drag.dy}px)`, zIndex: 5 }
              : undefined
          }
        >
          <button
            type="button"
            className="ruled__glyph"
            tabIndex={-1}
            aria-label={
              isStruck(line) ? "Mark as not done" : "Cross out / mark done"
            }
            onClick={() => tap(line.id)}
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
            onChange={(e) => editText(line.id, e.target.value)}
            onKeyDown={(e) => onKey(e, line.id)}
          />
          <span className="ruled__strike" aria-hidden="true" />
          {rows.length > 1 ? (
            <button
              type="button"
              className="ruled__grip"
              tabIndex={-1}
              aria-label="Drag to reorder"
              onPointerDown={(e) => onGripDown(e, line.id)}
              onPointerMove={onGripMove}
              onPointerUp={onGripUp}
              onPointerCancel={onGripUp}
            >
              ⠿
            </button>
          ) : null}
        </div>
      ))}
      {pageEmpty && placeholder ? (
        <p className="ruled__placeholder" aria-hidden="true">
          {placeholder}
        </p>
      ) : null}
    </div>
  );
}
