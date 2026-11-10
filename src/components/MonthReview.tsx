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
import {
  reviewMonth,
  type MonthReview as Review,
  type Thing,
} from "@/lib/month";
import { hiddenThings, hideThing, renameThing, trackThing } from "@/lib/things";
import { useLearned } from "@/lib/useLearned";
import { usePrefsLive } from "@/lib/usePrefsLive";
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
 *  one you stop opening.
 *
 *  The list is yours to keep: anything can be renamed, removed for good,
 *  or added back. A removal holds in every month, not just this one,
 *  which is the only reading of "I want it gone" that isn't annoying. */
export function MonthReview({ notebookId, anchorDate, onClose }: Props) {
  const learned = useLearned();
  const prefs = usePrefsLive();
  const [month, setMonth] = useState(() => startOfMonth(anchorDate));
  const [review, setReview] = useState<Review | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState("");
  const [showHidden, setShowHidden] = useState(false);

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
      setReview(reviewMonth(rows, month, learned, 2, prefs));
    })();
    return () => {
      alive = false;
    };
  }, [notebookId, month, learned, prefs]);

  const thisMonth = startOfMonth(todayKey());
  const removed = hiddenThings(prefs);

  const rename = (thing: Thing) => {
    const name = draft.trim();
    setEditing(null);
    // the word back under its own name, rather than a name that is the
    // word, so a later spelling change still shows through
    void renameThing(
      thing.words,
      name.toLowerCase() === thing.words.join(" ") ? "" : name,
    );
  };

  const add = () => {
    const word = adding.trim();
    if (!word) return;
    setAdding("");
    void trackThing(word);
  };

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

      {/* the list is the only part that scrolls — what you can do to it
          stays put at the bottom of the card, where a long month would
          otherwise push it off the end */}
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
              <li key={thing.words.join(" ")} className="mrev__thing">
                <span className="mrev__mark" aria-hidden="true">
                  {thing.icon ? (
                    <LineIcon icon={thing.icon} className="mrev__icon" />
                  ) : null}
                </span>

                {editing === thing.words.join(" ") ? (
                  <input
                    className="mrev__rename"
                    autoFocus
                    value={draft}
                    aria-label={`Rename ${thing.word}`}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => rename(thing)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") rename(thing);
                      if (e.key === "Escape") setEditing(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="mrev__word"
                    title="Rename"
                    onClick={() => {
                      setEditing(thing.words.join(" "));
                      setDraft(thing.word);
                    }}
                  >
                    {thing.word}
                  </button>
                )}

                <span className="mrev__rule" aria-hidden="true" />
                <span className="mrev__n">
                  {thing.done}
                  {/* nothing to say when you did everything you wrote */}
                  {thing.done === thing.written ? null : (
                    <span className="mrev__of"> of {thing.written}</span>
                  )}
                </span>
                <button
                  type="button"
                  className="mrev__drop"
                  title="Remove, in every month"
                  aria-label={`Remove ${thing.word}`}
                  onClick={() => void hideThing(thing.words)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {review === null ? null : (
        <div className="mrev__foot">
          <div className="mrev__add">
            <input
              className="mrev__add-input"
              value={adding}
              placeholder="Keep an eye on something…"
              aria-label="Add something to watch"
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
            />
            <button
              type="button"
              className="mrev__add-btn"
              disabled={!adding.trim()}
              onClick={add}
            >
              Add
            </button>
          </div>

          {removed.length > 0 ? (
            <div className="mrev__removed">
              <button
                type="button"
                className="mrev__removed-toggle"
                aria-expanded={showHidden}
                onClick={() => setShowHidden(!showHidden)}
              >
                {removed.length} removed
                {showHidden ? " ·  hide" : " ·  show"}
              </button>
              {showHidden ? (
                <ul className="mrev__removed-list">
                  {removed.map((words) => (
                    <li key={words.join(" ")}>
                      <button
                        type="button"
                        className="mrev__restore"
                        aria-label={`Put ${words.join(" ")} back`}
                        onClick={() => void trackThing(...words)}
                      >
                        {words.join(" ")} <span aria-hidden="true">+</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </Sheet>
  );
}
