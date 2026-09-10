import { useEffect, useState, useSyncExternalStore } from "react";
import {
  isToday,
  lastYear,
  longDate,
  ordinalDay,
  relativeDay,
  todayKey,
  weekday,
  type DayKey,
} from "@/lib/date";
import { getPage, pageId, type PaperStyle } from "@/lib/db";
import { getCached, prime, subscribe, writeLines } from "@/lib/pageStore";
import type { Line } from "@/lib/rapidlog";
import { glyphFor, isStruck } from "@/lib/rapidlog";
import { NAG_CAP } from "@/lib/rollover";
import { deadlineShort, urgencyOf } from "@/lib/deadline";
import { useSession } from "@/state/session";
import { useOverlay } from "@/state/overlay";
import { RuledLines } from "@/components/RuledLines";
import { DueSoon } from "@/components/DueSoon";
import "./daily-page.css";

interface Props {
  notebookId: string;
  date: DayKey;
  paper?: PaperStyle;
  /** a page sitting behind a turn is shown read-only */
  interactive?: boolean;
}

export function DailyPage({
  notebookId,
  date,
  paper = "cream-lined",
  interactive = true,
}: Props) {
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
  const show = useOverlay((s) => s.show);
  const goToDate = useSession((s) => s.goToDate);

  return (
    <article
      className={`daily daily--${paper} ${today ? "daily--today" : ""}`}
      data-paper={paper}
    >
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
            onClick={() => show("month")}
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
              date={date}
              notebookId={notebookId}
              onChange={(next) => writeLines(notebookId, date, next)}
              placeholder="What matters today?"
            />
          ) : (
            <StaticLines lines={lines} />
          )
        ) : null}
        {interactive && today ? <DueSoon notebookId={notebookId} /> : null}
        {interactive ? (
          <Marginalia key={date} notebookId={notebookId} date={date} />
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

/** The one thing paper can't do: remember what you wrote here a year ago.
 *  Drawn small, at the foot of the page, in the tone of a note someone
 *  pencilled in the margin — never a card, never a notification. */
function Marginalia({
  notebookId,
  date,
}: {
  notebookId: string;
  date: DayKey;
}) {
  const [echo, setEcho] = useState<Line | null>(null);

  useEffect(() => {
    let alive = true;
    void getPage(notebookId, lastYear(date)).then((page) => {
      if (!alive || !page) return;
      const written = page.lines
        .filter((l) => l.text.trim().length > 1 && !l.carriedTo)
        .sort((a, b) => b.text.length - a.text.length);
      setEcho(written[0] ?? null);
    });
    return () => {
      alive = false;
    };
  }, [notebookId, date]);

  if (!echo) return null;
  return (
    <aside className="daily__echo">
      <span className="daily__echo-when">a year ago</span>
      <span className="daily__echo-text">{echo.text}</span>
    </aside>
  );
}

function StaticLines({ lines }: { lines: Line[] }) {
  const written = lines.filter((l) => l.text.trim().length > 0);
  const today = todayKey();
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
          data-struck={isStruck(l) ? "1" : "0"}
        >
          <span className="ruled__glyph">{glyphFor(l)}</span>
          <span className="ruled__static">{l.text}</span>
          {l.deadline && !isStruck(l) ? (
            <span
              className={`ruled__chip ruled__chip--by ruled__chip--${urgencyOf(
                l.deadline,
                today,
              )}`}
            >
              {deadlineShort(l.deadline, today)}
            </span>
          ) : l.carriedTo ? (
            <span className="ruled__chip ruled__chip--moved">
              → {relativeDay(l.carriedTo, today)}
            </span>
          ) : l.someday ? (
            <span className="ruled__chip ruled__chip--someday">someday</span>
          ) : l.due ? (
            <span className="ruled__chip">{relativeDay(l.due, today)}</span>
          ) : null}
          <span className="ruled__strike" aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}
