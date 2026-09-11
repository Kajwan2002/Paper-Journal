import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  addDays,
  nextWeekday,
  relativeDay,
  todayKey,
  endOfMonth,
  type DayKey,
} from "@/lib/date";
import { deadlineLabel } from "@/lib/deadline";
import {
  GLYPH,
  isTaskKind,
  QUICK_KINDS,
  type Line,
  type LineKind,
} from "@/lib/rapidlog";
import { DayPicker } from "@/components/DayPicker";
import "./line-menu.css";

interface Props {
  line: Line;
  date: DayKey;
  /** the ⋯ button this menu hangs off, in viewport coordinates */
  anchor: DOMRect | null;
  onPatch: (change: (line: Line) => Line) => void;
  /** file this line onto another day — it moves there, leaving a breadcrumb */
  onMove: (day: DayKey) => void;
  onDelete: () => void;
  onClose: () => void;
}

const GUTTER = 8;

const KIND_LABEL: Record<LineKind, string> = {
  task: "Task",
  priority: "Priority",
  event: "Event",
  idea: "Idea",
  note: "Note",
  done: "Task", // legacy — never offered, but keeps the record type total
  migrated: "Task",
};

/** What you'd do to a line with a pen: move it to another day, park it,
 *  nudge it in, or strike it out for good. One sheet, no settings.
 *
 *  Rendered into <body> rather than beside the line. The page sets
 *  `container-type` and the book sets `perspective`, and both of those make
 *  an element a containing block for `position: fixed` descendants — so a
 *  menu rendered in place anchored itself to the page instead of the
 *  screen, got clipped by the page's overflow, and had its text faded out
 *  by the scroll mask. On a phone that left an unreadable strip at the
 *  bottom of the paper and put the calendar off-screen entirely. */
export function LineMenu({
  line,
  date,
  anchor,
  onPatch,
  onMove,
  onDelete,
  onClose,
}: Props) {
  const [picking, setPicking] = useState<null | "move" | "deadline">(null);
  const ref = useRef<HTMLDivElement>(null);
  const scheduled = !!line.due || !!line.someday;
  // a breadcrumb is a record of where something went, not a live task —
  // there is nothing to reschedule, or to retype: it isn't really any kind
  // any more, just a note that something moved on
  const isBreadcrumb = !!line.carriedTo;
  const task = isTaskKind(line) && !isBreadcrumb;

  // phones get a bottom sheet; anything roomier gets a popover by the line
  const [sheet, setSheet] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= 680,
  );
  useEffect(() => {
    const onResize = () => setSheet(window.innerWidth <= 680);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // place the popover against the button, then pull it back inside the
  // viewport — including when opening the day picker makes it much taller
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (sheet || !anchor || !el) {
      setPos(null);
      return;
    }
    const { width, height } = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - anchor.bottom;
    const top =
      spaceBelow < height + GUTTER && anchor.top > height + GUTTER
        ? anchor.top - height - 4
        : Math.min(anchor.bottom + 4, window.innerHeight - height - GUTTER);
    const left = Math.max(
      GUTTER,
      Math.min(anchor.right - width, window.innerWidth - width - GUTTER),
    );
    setPos({ top: Math.max(GUTTER, top), left });
  }, [anchor, sheet, picking]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    // capture so the book's own Escape handler doesn't also fire
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const moveTo = (day: DayKey) => onMove(day);
  const setDeadline = (day: DayKey | undefined) =>
    onPatch((l) => ({ ...l, deadline: day }));
  const setKind = (kind: LineKind) => onPatch((l) => ({ ...l, kind }));

  // a carried task and the legacy "done" kind aren't in the picker — treat
  // them as the closest thing on it, rather than showing nothing selected
  const currentKind: LineKind =
    line.kind === "done" || line.kind === "migrated" ? "task" : line.kind;

  const byWhen: Array<[string, DayKey]> = [
    ["End of this week", nextWeekday(date, 0)],
    ["In two weeks", addDays(date, 14)],
    ["End of the month", endOfMonth(date)],
  ];

  const soon: Array<[string, DayKey]> = [
    ["Tomorrow", addDays(date, 1)],
    ["This weekend", nextWeekday(date, 6)],
    ["Next week", addDays(date, 7)],
  ];

  const body = (
    <div
      className={`lmenu ${sheet ? "lmenu--sheet" : ""}`}
      role="menu"
      ref={ref}
      style={
        sheet ? undefined : { top: pos?.top ?? -9999, left: pos?.left ?? -9999 }
      }
    >
      {picking === "move" ? (
        <DayPicker value={line.due ?? date} onPick={moveTo} autoFocus />
      ) : picking === "deadline" ? (
        <DayPicker
          value={line.deadline ?? date}
          onPick={(d) => setDeadline(d)}
          autoFocus
        />
      ) : (
        <>
          {task ? (
            <>
              <p className="lmenu__label">Move to</p>
              {soon.map(([label, day]) => (
                <button
                  key={label}
                  type="button"
                  role="menuitem"
                  className="lmenu__item"
                  onClick={() => moveTo(day)}
                >
                  <span>{label}</span>
                  <span className="lmenu__hint">{relativeDay(day, date)}</span>
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                className="lmenu__item"
                onClick={() => setPicking("move")}
              >
                <span>Pick a day…</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="lmenu__item"
                onClick={() =>
                  onPatch((l) => ({
                    ...l,
                    someday: true,
                    due: undefined,
                    rolls: 0,
                  }))
                }
              >
                <span>Someday</span>
                <span className="lmenu__hint">stop nagging</span>
              </button>
              {scheduled ? (
                <button
                  type="button"
                  role="menuitem"
                  className="lmenu__item"
                  onClick={() =>
                    onPatch((l) => ({
                      ...l,
                      due: undefined,
                      someday: undefined,
                    }))
                  }
                >
                  <span>Unschedule</span>
                </button>
              ) : null}

              <hr className="lmenu__rule" />
              <p className="lmenu__label">Due by</p>
              {line.deadline ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className="lmenu__item lmenu__item--on"
                    onClick={() => setPicking("deadline")}
                  >
                    <span>{relativeDay(line.deadline, date)}</span>
                    <span className="lmenu__hint">
                      {deadlineLabel(line.deadline, todayKey())}
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="lmenu__item"
                    onClick={() => setDeadline(undefined)}
                  >
                    <span>No deadline</span>
                  </button>
                </>
              ) : (
                <>
                  {byWhen.map(([label, day]) => (
                    <button
                      key={label}
                      type="button"
                      role="menuitem"
                      className="lmenu__item"
                      onClick={() => setDeadline(day)}
                    >
                      <span>{label}</span>
                      <span className="lmenu__hint">
                        {relativeDay(day, date)}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    role="menuitem"
                    className="lmenu__item"
                    onClick={() => setPicking("deadline")}
                  >
                    <span>Pick a deadline…</span>
                  </button>
                </>
              )}

              <hr className="lmenu__rule" />
            </>
          ) : null}

          {!isBreadcrumb ? (
            <>
              <p className="lmenu__label">Change to</p>
              <div className="lmenu__kinds" role="group" aria-label="Type">
                {QUICK_KINDS.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    role="menuitemradio"
                    aria-checked={kind === currentKind}
                    className={`lmenu__kind ${
                      kind === currentKind ? "lmenu__kind--on" : ""
                    }`}
                    title={KIND_LABEL[kind]}
                    aria-label={KIND_LABEL[kind]}
                    onClick={() => setKind(kind)}
                  >
                    {GLYPH[kind]}
                  </button>
                ))}
              </div>
              <hr className="lmenu__rule" />
            </>
          ) : null}

          <button
            type="button"
            role="menuitem"
            className="lmenu__item"
            onClick={() =>
              onPatch((l) => ({ ...l, indent: l.indent === 1 ? 0 : 1 }))
            }
          >
            <span>{line.indent === 1 ? "Outdent" : "Indent"}</span>
            <span className="lmenu__hint">Tab</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="lmenu__item lmenu__item--danger"
            onClick={onDelete}
          >
            <span>Delete line</span>
          </button>
        </>
      )}
    </div>
  );

  return createPortal(
    <>
      {sheet ? <div className="lmenu__scrim" aria-hidden="true" /> : null}
      {body}
    </>,
    document.body,
  );
}
