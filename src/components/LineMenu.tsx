import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addDays, nextWeekday, relativeDay, type DayKey } from "@/lib/date";
import { isTaskKind, type Line } from "@/lib/rapidlog";
import { DayPicker } from "@/components/DayPicker";
import "./line-menu.css";

interface Props {
  line: Line;
  date: DayKey;
  /** the ⋯ button this menu hangs off, in viewport coordinates */
  anchor: DOMRect | null;
  onPatch: (change: (line: Line) => Line) => void;
  onDelete: () => void;
  onClose: () => void;
}

const GUTTER = 8;

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
  onDelete,
  onClose,
}: Props) {
  const [picking, setPicking] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const scheduled = !!line.due || !!line.someday;
  const task = isTaskKind(line);

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

  const moveTo = (day: DayKey) =>
    onPatch((l) => ({ ...l, due: day, someday: undefined, rolls: 0 }));

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
      {picking ? (
        <DayPicker value={line.due ?? date} onPick={moveTo} autoFocus />
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
                onClick={() => setPicking(true)}
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
