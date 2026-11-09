import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { flushAsync } from "@/lib/pageStore";
import {
  addMonths,
  endOfMonth,
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

/** The month, counted.
 *
 *  One question, answered once: how many times did I do each thing. The
 *  crossings lead and the times it was written down follow, so the page
 *  is true whether the notebook is kept as a list or as a log. No grid of
 *  which days were productive, no score — a journal that grades you is
 *  one you stop opening. */
export function MonthReview({ notebookId, anchorDate, onClose }: Props) {
  const learned = useLearned();
  const [month, setMonth] = useState(() => startOfMonth(anchorDate));
  const [review, setReview] = useState<Review | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await flushAsync();
      const rows = await db.pages
        .where("[notebookId+date]")
        .between(
          [notebookId, startOfMonth(month)],
          [notebookId, endOfMonth(month)],
          true,
          true,
        )
        .toArray();
      if (!alive) return;
      setReview(reviewMonth(rows, month, learned));
    })();
    return () => {
      alive = false;
    };
  }, [notebookId, month, learned]);

  const thisMonth = startOfMonth(todayKey());

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
        <h2 className="sheet__title mrev__title">{review?.title ?? ""}</h2>
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
        {review === null ? null : review.things.length === 0 ? (
          <p className="mrev__empty">
            {review.written === 0
              ? "Nothing written this month."
              : "Nothing has come up more than once yet."}
          </p>
        ) : (
          <ul className="mrev__things">
            {review.things.map((thing) => (
              <li key={thing.word} className="mrev__thing">
                <span className="mrev__mark" aria-hidden="true">
                  {thing.icon ? (
                    <LineIcon icon={thing.icon} className="mrev__icon" />
                  ) : null}
                </span>
                <span className="mrev__word">{thing.word}</span>
                <span className="mrev__rule" aria-hidden="true" />
                <span className="mrev__n">
                  {thing.done}
                  {/* nothing to say when you did everything you wrote */}
                  {thing.done === thing.written ? null : (
                    <span className="mrev__of"> of {thing.written}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
