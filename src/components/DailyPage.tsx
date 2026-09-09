import { useEffect, useSyncExternalStore } from "react";
import {
  isToday,
  longDate,
  ordinalDay,
  weekday,
  type DayKey,
} from "@/lib/date";
import { pageId } from "@/lib/db";
import { getCached, prime, subscribe, writeLines } from "@/lib/pageStore";
import type { Line } from "@/lib/rapidlog";
import { RuledLines } from "@/components/RuledLines";
import "./daily-page.css";

interface Props {
  notebookId: string;
  date: DayKey;
  /** the layer sitting behind a page-turn is shown read-only */
  interactive?: boolean;
}

export function DailyPage({ notebookId, date, interactive = true }: Props) {
  const key = pageId(notebookId, date);

  const lines = useSyncExternalStore(
    (cb) => subscribe(key, cb),
    () => getCached(key),
  );

  useEffect(() => {
    void prime(notebookId, date);
  }, [notebookId, date]);

  const today = isToday(date);
  const ready = lines !== undefined;

  return (
    <article className={`daily ${today ? "daily--today" : ""}`}>
      <header className="daily__head">
        <div className="daily__meta">
          <span className="daily__weekday">{weekday(date)}</span>
          <span className="daily__folio">
            {today ? "today" : `no. ${ordinalDay(date)}`}
          </span>
        </div>
        <h1 className="daily__date">{longDate(date)}</h1>
      </header>

      <div className="daily__body">
        {ready ? (
          interactive ? (
            <RuledLines
              lines={lines}
              onChange={(next) => writeLines(notebookId, date, next)}
              placeholder="What matters today?"
            />
          ) : (
            <StaticLines lines={lines} />
          )
        ) : null}
      </div>
    </article>
  );
}

function StaticLines({ lines }: { lines: Line[] }) {
  const rows: Line[] =
    lines.length > 0 ? lines : [{ id: "x", kind: "note", text: "" }];
  return (
    <div className="ruled" aria-hidden="true">
      {rows.map((l) => (
        <div key={l.id} className={`ruled__row ruled__row--${l.kind}`}>
          <span className="ruled__glyph" />
          <span className="ruled__static">{l.text}</span>
        </div>
      ))}
    </div>
  );
}
