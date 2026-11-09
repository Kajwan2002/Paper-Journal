import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { flushAsync } from "@/lib/pageStore";
import {
  addMonths,
  endOfMonth,
  fromDayKey,
  startOfMonth,
  todayKey,
  type DayKey,
} from "@/lib/date";
import { reviewMonth, type MonthReview as Review } from "@/lib/month";
import { useLearned } from "@/lib/useLearned";
import { LineIcon } from "@/components/LineIcon";
import { Sheet } from "@/components/Sheet";
import "./month-review.css";

interface Props {
  notebookId: string;
  anchorDate: DayKey;
  onClose: () => void;
}

/** The month, read back.
 *
 *  Deliberately not a dashboard: no graphs, no percentages, no score. The
 *  notebook's rule is that the page stays analog and the intelligence
 *  lives in the margins, so this is a dot grid, a row of the drawings it
 *  already makes, and at most three sentences — all in the same ink as
 *  everything else. The month's gaps are left as gaps, because on paper
 *  that is what a quiet fortnight looks like and it is worth seeing. */
export function MonthReview({ notebookId, anchorDate, onClose }: Props) {
  const learned = useLearned();
  const [month, setMonth] = useState(() => startOfMonth(anchorDate));
  const [review, setReview] = useState<Review | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await flushAsync();
      const from = startOfMonth(addMonths(month, -1));
      const to = endOfMonth(month);
      const rows = await db.pages
        .where("[notebookId+date]")
        .between([notebookId, from], [notebookId, to], true, true)
        .toArray();
      if (!alive) return;
      const here = startOfMonth(month);
      setReview(
        reviewMonth(
          rows.filter((r) => r.date >= here),
          month,
          learned,
          rows.filter((r) => r.date < here),
        ),
      );
    })();
    return () => {
      alive = false;
    };
  }, [notebookId, month, learned]);

  const thisMonth = startOfMonth(todayKey());
  const label = review?.title ?? "";
  // Monday-first, matching the day picker
  const lead = (fromDayKey(month).getDay() + 6) % 7;

  return (
    <Sheet label="The month" onClose={onClose}>
      <div className="mrev__head">
        <button
          type="button"
          className="mrev__step"
          aria-label="The month before"
          onClick={() => setMonth(addMonths(month, -1))}
        >
          ‹
        </button>
        <h2 className="sheet__title mrev__title">{label}</h2>
        <button
          type="button"
          className="mrev__step"
          aria-label="The month after"
          disabled={month >= thisMonth}
          onClick={() => setMonth(addMonths(month, 1))}
        >
          ›
        </button>
      </div>

      <div className="sheet__body">
        {review === null ? null : (
          <>
            <div className="mrev__grid" aria-hidden="true">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <span key={i} className="mrev__dow">
                  {d}
                </span>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <span key={`lead${i}`} />
              ))}
              {review.days.map((day) => (
                <span
                  key={day.date}
                  className={`mrev__day ${day.isToday ? "mrev__day--today" : ""} ${
                    day.future ? "mrev__day--future" : ""
                  }`}
                  data-ink={inkOf(day.written)}
                  title={`${day.date}: ${day.written} written, ${day.finished} finished`}
                />
              ))}
            </div>

            <p className="mrev__count">
              {review.daysWritten === 0
                ? "Nothing written this month yet."
                : `Written on ${review.daysWritten} of ${review.daysSoFar} days · ${review.finished} finished`}
            </p>

            {review.drawings.length > 0 ? (
              <section className="mrev__block">
                <h3 className="mrev__label">What the month was made of</h3>
                <ul className="mrev__things">
                  {review.drawings.map((d) => (
                    <li key={d.icon} className="mrev__thing">
                      <LineIcon icon={d.icon} className="mrev__icon" />
                      <span className="mrev__n">{d.count}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {review.clung.length > 0 ||
            review.deadlines.met + review.deadlines.missed > 0 ? (
              <section className="mrev__block">
                <h3 className="mrev__label">What it cost</h3>
                {review.clung.map((c) => (
                  <p key={c.text} className="mrev__cost">
                    <span className="mrev__cost-text">{c.text}</span>
                    <span className="mrev__cost-n">
                      {c.rolls} {c.rolls === 1 ? "morning" : "mornings"}
                    </span>
                  </p>
                ))}
                {review.deadlines.met + review.deadlines.missed > 0 ? (
                  <p className="mrev__cost">
                    <span className="mrev__cost-text">Deadlines</span>
                    <span className="mrev__cost-n">
                      {review.deadlines.met} met
                      {review.deadlines.missed > 0
                        ? ` · ${review.deadlines.missed} missed`
                        : ""}
                    </span>
                  </p>
                ) : null}
              </section>
            ) : null}

            {review.remarks.length > 0 ? (
              <section className="mrev__block mrev__block--said">
                {review.remarks.map((r) => (
                  <p key={r} className="mrev__remark">
                    {r}
                  </p>
                ))}
              </section>
            ) : null}
          </>
        )}
      </div>
    </Sheet>
  );
}

/** Four steps of ink. A day is darker for having more on it, but the scale
 *  tops out quickly — the difference between a busy day and a very busy
 *  one is not worth reading, while the difference between a day and a
 *  blank one is the whole point. */
function inkOf(written: number): 0 | 1 | 2 | 3 {
  if (written === 0) return 0;
  if (written <= 2) return 1;
  if (written <= 5) return 2;
  return 3;
}
