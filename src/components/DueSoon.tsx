import { useCallback, useEffect, useState } from "react";
import { comingDue, deadlineLabel, type Due } from "@/lib/deadline";
import { prime, subscribeJournal } from "@/lib/pageStore";
import { relativeDay, todayKey, type DayKey } from "@/lib/date";
import { useSession } from "@/state/session";
import "./due-soon.css";

/** A standing note in the margin of today's page: everything with a
 *  deadline inside the next week, and everything already overdue.
 *
 *  This is the answer to "I don't want to find out on the day". A task with
 *  a deadline may be sitting on a page weeks away where you will never see
 *  it, so the deadline has to come to you rather than waiting to be found.
 *  It is a pencilled note at the foot of the page, not a notification — the
 *  page still has to look like paper. */
export function DueSoon({ notebookId }: { notebookId: string }) {
  const [due, setDue] = useState<Due[] | null>(null);
  const goToDate = useSession((s) => s.goToDate);
  const today = todayKey();

  const load = useCallback(() => {
    void comingDue(notebookId).then(setDue);
  }, [notebookId]);

  useEffect(() => {
    load();
    let timer: ReturnType<typeof setTimeout>;
    const stop = subscribeJournal(() => {
      clearTimeout(timer);
      timer = setTimeout(load, 600);
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [load]);

  if (!due || due.length === 0) return null;

  const visit = (date: DayKey) => {
    goToDate(date);
    void prime(notebookId, date);
  };

  const late = due.filter((d) => d.urgency === "late").length;

  return (
    <aside className="duesoon" aria-label="Deadlines coming up">
      <p className="duesoon__head">
        {late > 0 ? "Overdue · coming up" : "Coming up"}
      </p>
      <ul className="duesoon__list">
        {due.map((d) => (
          <li key={`${d.date}-${d.line.id}`}>
            <button
              type="button"
              className={`duesoon__item duesoon__item--${d.urgency}`}
              onClick={() => visit(d.date)}
            >
              <span className="duesoon__when">
                {deadlineLabel(d.deadline, today)}
              </span>
              <span className="duesoon__text">{d.line.text}</span>
              {d.date !== today ? (
                <span className="duesoon__where">
                  on {relativeDay(d.date, today)}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
