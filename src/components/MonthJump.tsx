import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/db";
import { prime } from "@/lib/pageStore";
import {
  addMonths,
  isSameMonth,
  isToday,
  monthGrid,
  monthTitle,
  startOfMonth,
  todayKey,
  type DayKey,
} from "@/lib/date";
import { useSession } from "@/state/session";
import "./month-jump.css";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

interface Props {
  notebookId: string;
  anchorDate: DayKey;
  onClose: () => void;
}

export function MonthJump({ notebookId, anchorDate, onClose }: Props) {
  const [view, setView] = useState(() => startOfMonth(anchorDate));
  const [written, setWritten] = useState<Set<DayKey>>(new Set());
  const goToDate = useSession((s) => s.goToDate);
  const grid = useMemo(() => monthGrid(view), [view]);

  useEffect(() => {
    let alive = true;
    const from = startOfMonth(view);
    const to = addMonths(from, 1);
    db.pages
      .where("[notebookId+date]")
      .between([notebookId, from], [notebookId, to], true, false)
      .toArray()
      .then((rows) => {
        if (alive) setWritten(new Set(rows.map((r) => r.date)));
      });
    return () => {
      alive = false;
    };
  }, [notebookId, view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const pick = (day: DayKey) => {
    goToDate(day);
    void prime(notebookId, day);
    onClose();
  };

  return (
    <div
      className="mjump__scrim"
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mjump" role="dialog" aria-label="Jump to a day">

        <div className="mjump__head">
          <button
            type="button"
            className="mjump__nav"
            aria-label="Previous month"
            onClick={() => setView(addMonths(view, -1))}
          >
            ‹
          </button>
          <span className="mjump__title">{monthTitle(view)}</span>
          <button
            type="button"
            className="mjump__nav"
            aria-label="Next month"
            onClick={() => setView(addMonths(view, 1))}
          >
            ›
          </button>
        </div>

        <div className="mjump__dow">
          {DOW.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>

        <div className="mjump__grid">
          {grid.map((day) => {
            const inMonth = isSameMonth(day, view);
            const cls = [
              "mjump__day",
              inMonth ? "" : "mjump__day--spill",
              isToday(day) ? "mjump__day--today" : "",
              day === anchorDate ? "mjump__day--here" : "",
              written.has(day) ? "mjump__day--dot" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                type="button"
                key={day}
                className={cls}
                onClick={() => pick(day)}
              >
                {Number(day.slice(8, 10))}
              </button>
            );
          })}
        </div>

        {anchorDate !== todayKey() ? (
          <button
            type="button"
            className="mjump__today"
            onClick={() => pick(todayKey())}
          >
            · today ·
          </button>
        ) : null}
      </div>
    </div>
  );
}
