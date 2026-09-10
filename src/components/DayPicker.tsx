import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  isSameMonth,
  isToday,
  monthGrid,
  monthTitle,
  startOfMonth,
  type DayKey,
} from "@/lib/date";
import "./day-picker.css";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

export interface DayMark {
  /** open commitments on that day — drawn as a small tally */
  open?: number;
  /** anything written at all */
  written?: boolean;
}

interface Props {
  /** the day drawn as "you are here" */
  value: DayKey;
  onPick: (day: DayKey) => void;
  marks?: Map<DayKey, DayMark>;
  /** told the visible range whenever the month changes, so the owner can
   *  load marks for exactly the 42 days on screen. May return a cleanup,
   *  which is run before the next range or on unmount. */
  onRangeChange?: (from: DayKey, to: DayKey) => void | (() => void);
  autoFocus?: boolean;
}

export function DayPicker({
  value,
  onPick,
  marks,
  onRangeChange,
  autoFocus,
}: Props) {
  const [view, setView] = useState(() => startOfMonth(value));
  const [cursor, setCursor] = useState<DayKey>(value);
  const gridRef = useRef<HTMLDivElement>(null);
  const grid = useMemo(() => monthGrid(view), [view]);

  useEffect(
    () => onRangeChange?.(grid[0], grid[grid.length - 1]),
    [grid, onRangeChange],
  );

  // keep the roving focus on the cursor once the user starts arrowing
  const [roving, setRoving] = useState(false);
  useEffect(() => {
    if (!roving) return;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-day="${cursor}"]`)
      ?.focus();
  }, [cursor, roving]);

  const move = (delta: number) => {
    const next = addDays(cursor, delta);
    setRoving(true);
    setCursor(next);
    if (!isSameMonth(next, view)) setView(startOfMonth(next));
  };

  const onKey = (e: React.KeyboardEvent) => {
    const map: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      PageUp: -28,
      PageDown: 28,
    };
    const delta = map[e.key];
    if (delta !== undefined) {
      e.preventDefault();
      move(delta);
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const days = grid.filter((d) => isSameMonth(d, view));
      const target = e.key === "Home" ? days[0] : days[days.length - 1];
      setRoving(true);
      setCursor(target);
    }
  };

  return (
    <div className="dpick" onKeyDown={onKey}>
      <div className="dpick__head">
        <button
          type="button"
          className="dpick__nav"
          aria-label="Previous month"
          onClick={() => setView(addMonths(view, -1))}
        >
          ‹
        </button>
        <span className="dpick__title" aria-live="polite">
          {monthTitle(view)}
        </span>
        <button
          type="button"
          className="dpick__nav"
          aria-label="Next month"
          onClick={() => setView(addMonths(view, 1))}
        >
          ›
        </button>
      </div>

      <div className="dpick__dow" aria-hidden="true">
        {DOW.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      <div className="dpick__grid" role="grid" ref={gridRef}>
        {grid.map((day) => {
          const mark = marks?.get(day);
          const inMonth = isSameMonth(day, view);
          const isCursor = day === cursor;
          return (
            <button
              type="button"
              key={day}
              data-day={day}
              role="gridcell"
              tabIndex={isCursor ? 0 : -1}
              aria-current={day === value ? "date" : undefined}
              aria-label={day}
              className={[
                "dpick__day",
                inMonth ? "" : "dpick__day--spill",
                isToday(day) ? "dpick__day--today" : "",
                day === value ? "dpick__day--here" : "",
                mark?.written ? "dpick__day--written" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onFocus={() => setCursor(day)}
              onClick={() => onPick(day)}
              ref={
                autoFocus && day === value
                  ? (el) => {
                      if (el && !roving) el.focus({ preventScroll: true });
                    }
                  : undefined
              }
            >
              <span className="dpick__num">{Number(day.slice(8, 10))}</span>
              {mark?.open ? (
                <span className="dpick__load" aria-hidden="true">
                  {"·".repeat(Math.min(mark.open, 3))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
