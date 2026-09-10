import { useCallback, useState } from "react";
import { db } from "@/lib/db";
import { flushAsync, prime } from "@/lib/pageStore";
import { isDue } from "@/lib/rapidlog";
import { todayKey, type DayKey } from "@/lib/date";
import { useSession } from "@/state/session";
import { DayPicker, type DayMark } from "@/components/DayPicker";
import { Sheet } from "@/components/Sheet";
import "./month-jump.css";

interface Props {
  notebookId: string;
  anchorDate: DayKey;
  onClose: () => void;
}

export function MonthJump({ notebookId, anchorDate, onClose }: Props) {
  const [marks, setMarks] = useState<Map<DayKey, DayMark>>(new Map());
  const goToDate = useSession((s) => s.goToDate);

  // Loaded for the 42 days actually on screen. It used to query only the
  // calendar month, so the leading and trailing days of the grid always
  // looked empty even when they had a page.
  const loadRange = useCallback(
    (from: DayKey, to: DayKey) => {
      let alive = true;
      void (async () => {
        await flushAsync();
        const rows = await db.pages
          .where("[notebookId+date]")
          .between([notebookId, from], [notebookId, to], true, true)
          .toArray();
        if (!alive) return;
        const today = todayKey();
        setMarks(
          new Map(
            rows.map((row) => [
              row.date,
              {
                written: row.lines.some((l) => l.text.trim().length > 0),
                open: row.lines.filter((l) => !l.carriedTo && isDue(l, today))
                  .length,
              },
            ]),
          ),
        );
      })();
      return () => {
        alive = false;
      };
    },
    [notebookId],
  );

  const pick = (day: DayKey) => {
    goToDate(day);
    void prime(notebookId, day);
    onClose();
  };

  return (
    <Sheet label="Jump to a day" onClose={onClose}>
      <DayPicker
        value={anchorDate}
        onPick={pick}
        marks={marks}
        onRangeChange={loadRange}
        autoFocus
      />
      {anchorDate !== todayKey() ? (
        <button
          type="button"
          className="mjump__today"
          onClick={() => pick(todayKey())}
        >
          · today ·
        </button>
      ) : null}
    </Sheet>
  );
}
