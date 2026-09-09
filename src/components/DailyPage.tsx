import { useEffect, useSyncExternalStore } from "react";
import {
  isToday,
  longDate,
  ordinalDay,
  todayKey,
  weekday,
  type DayKey,
} from "@/lib/date";
import { pageId } from "@/lib/db";
import { getCached, prime, subscribe, writeLines } from "@/lib/pageStore";
import type { Line } from "@/lib/rapidlog";
import { GLYPH } from "@/lib/rapidlog";
import { NAG_CAP } from "@/lib/rollover";
import { useSession } from "@/state/session";
import { useOverlay } from "@/state/overlay";
import { RuledLines } from "@/components/RuledLines";
import "./daily-page.css";

interface Props {
  notebookId: string;
  date: DayKey;
  /** a page sitting behind a turn is shown read-only */
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
  const openMonth = useOverlay((s) => s.openMonth);
  const goToDate = useSession((s) => s.goToDate);

  return (
    <article className={`daily ${today ? "daily--today" : ""}`}>
      <div className="daily__margin" aria-hidden="true" />
      <header className="daily__head">
        <div className="daily__meta">
          <span className="daily__weekday">{weekday(date)}</span>
          <span className="daily__folio">
            {today ? "today" : `no. ${ordinalDay(date)}`}
          </span>
        </div>
        {interactive ? (
          <button
            type="button"
            className="daily__datebtn"
            aria-label={`${longDate(date)} — jump to another day`}
            onClick={openMonth}
          >
            <h1 className="daily__date">{longDate(date)}</h1>
          </button>
        ) : (
          <h1 className="daily__date">{longDate(date)}</h1>
        )}
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

      {interactive && !today ? (
        <button
          type="button"
          className="daily__dogear"
          aria-label="Back to today"
          onClick={() => {
            const t = todayKey();
            goToDate(t);
            void prime(notebookId, t);
          }}
        />
      ) : null}
    </article>
  );
}

function StaticLines({ lines }: { lines: Line[] }) {
  const written = lines.filter((l) => l.text.trim().length > 0);
  if (written.length === 0) {
    return (
      <div className="ruled" aria-hidden="true">
        <p className="ruled__placeholder">What matters today?</p>
      </div>
    );
  }
  return (
    <div className="ruled" aria-hidden="true">
      {written.map((l) => (
        <div
          key={l.id}
          className={`ruled__row ruled__row--${l.kind}`}
          data-indent={l.indent ?? 0}
          data-rolls={Math.min(l.rolls ?? 0, NAG_CAP)}
        >
          <span className="ruled__glyph">{GLYPH[l.kind]}</span>
          <span className="ruled__static">{l.text}</span>
        </div>
      ))}
    </div>
  );
}
