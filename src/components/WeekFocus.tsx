import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { subscribeJournal } from "@/lib/pageStore";
import { startOfWeek, weekRangeLabel, type DayKey } from "@/lib/date";
import {
  focusRows,
  loadFocusLines,
  newFocusLine,
  saveFocusLines,
  type FocusLine,
} from "@/lib/focus";
import "./week-focus.css";

interface Props {
  notebookId: string;
  date: DayKey;
}

interface Tally {
  target?: number;
  count: number;
}

/** There's always one more, blank line to type into — the same trick a
 *  to-do list uses — but never a saved blank: `saveFocusLines` drops empty
 *  lines before they reach storage. */
function withTrailingBlank(lines: FocusLine[]): FocusLine[] {
  const last = lines[lines.length - 1];
  if (!last || last.text.trim() !== "") return [...lines, newFocusLine()];
  return lines;
}

/** The margin of a real weekly planner: a few lines jotted once, that stay
 *  in view on every day of that week while you plan it — not a task,
 *  nothing that rolls over, nothing that nags once the week is over.
 *
 *  A line can end in "x3" to say how often. The marks beside it are just a
 *  tally of how many things you finished this week shared a word with it —
 *  never a grade, never coloured red, never something to fail. A week you
 *  never touch this just quietly becomes last week. */
export function WeekFocus({ notebookId, date }: Props) {
  const weekStart = startOfWeek(date);
  const [lines, setLines] = useState<FocusLine[] | null>(null);
  const [tally, setTally] = useState<Map<string, Tally>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reloadTally = useCallback(() => {
    void focusRows(notebookId, date).then((rows) => {
      setTally(
        new Map(rows.map((r) => [r.id, { target: r.target, count: r.count }])),
      );
    });
  }, [notebookId, date]);

  useEffect(() => {
    let alive = true;
    void loadFocusLines(notebookId, date).then((got) => {
      if (alive) setLines(withTrailingBlank(got));
    });
    reloadTally();
    return () => {
      alive = false;
    };
  }, [notebookId, date, weekStart, reloadTally]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const stop = subscribeJournal(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        reloadTally();
        // an edit in flight here wins over a reload — never stomp a keystroke
        if (containerRef.current?.contains(document.activeElement)) return;
        void loadFocusLines(notebookId, date).then((got) => {
          setLines(withTrailingBlank(got));
        });
      }, 700);
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [notebookId, date, reloadTally]);

  const commit = useCallback(
    (next: FocusLine[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void saveFocusLines(
          notebookId,
          date,
          next.filter((l) => l.text.trim().length > 0),
        );
      }, 500);
    },
    [notebookId, date],
  );

  // the target row already exists in the DOM by the time this runs — both
  // callers only ever point at a row rendered on the *previous* keystroke —
  // so focusing synchronously (rather than via requestAnimationFrame) is
  // what stops a fast typist's next character landing in the old input
  // before focus has actually moved.
  const focusInput = (id: string | undefined) => {
    if (!id) return;
    inputRefs.current.get(id)?.focus();
  };

  const setLineText = (id: string, text: string) => {
    setLines((prev) => {
      if (!prev) return prev;
      const next = withTrailingBlank(
        prev.map((l) => (l.id === id ? { ...l, text } : l)),
      );
      commit(next);
      return next;
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>, i: number) => {
    if (!lines) return;
    if (e.key === "Enter") {
      e.preventDefault();
      focusInput(lines[i + 1]?.id);
      return;
    }
    if (e.key === "Backspace" && lines[i].text === "" && i > 0) {
      e.preventDefault();
      const next = withTrailingBlank(lines.filter((_, idx) => idx !== i));
      setLines(next);
      commit(next);
      focusInput(lines[i - 1]?.id);
    }
  };

  if (!lines) return null;
  const hasAny = lines.some((l) => l.text.trim().length > 0);

  return (
    <div className="weekfocus" ref={containerRef}>
      <p className="weekfocus__head">This week · {weekRangeLabel(weekStart)}</p>
      <div className="weekfocus__lines">
        {lines.map((line, i) => {
          const t = tally.get(line.id);
          return (
            <div className="weekfocus__row" key={line.id}>
              <input
                ref={(el) => {
                  if (el) inputRefs.current.set(line.id, el);
                  else inputRefs.current.delete(line.id);
                }}
                className="weekfocus__input"
                type="text"
                value={line.text}
                placeholder={
                  i === 0 && !hasAny ? "What matters this week?" : ""
                }
                onChange={(e) => setLineText(line.id, e.target.value)}
                onKeyDown={(e) => onKeyDown(e, i)}
              />
              {t?.target ? (
                <span className="weekfocus__dots" aria-hidden="true">
                  {Array.from({ length: t.target }, (_, d) => (
                    <span
                      key={d}
                      className={`weekfocus__dot ${d < t.count ? "weekfocus__dot--on" : ""}`}
                    />
                  ))}
                </span>
              ) : t && t.count > 0 ? (
                <span className="weekfocus__count">{t.count}× this week</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
