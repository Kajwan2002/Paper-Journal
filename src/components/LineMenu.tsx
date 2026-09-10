import { useEffect, useRef, useState } from "react";
import { addDays, nextWeekday, relativeDay, type DayKey } from "@/lib/date";
import { isTaskKind, type Line } from "@/lib/rapidlog";
import { DayPicker } from "@/components/DayPicker";
import "./line-menu.css";

interface Props {
  line: Line;
  date: DayKey;
  onPatch: (change: (line: Line) => Line) => void;
  onDelete: () => void;
  onClose: () => void;
}

/** What you'd do to a line with a pen: move it to another day, park it,
 *  nudge it in, or strike it out for good. One sheet, no settings. */
export function LineMenu({ line, date, onPatch, onDelete, onClose }: Props) {
  const [picking, setPicking] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const scheduled = !!line.due || !!line.someday;
  const task = isTaskKind(line);

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

  return (
    <div className="lmenu" role="menu" ref={ref}>
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
}
