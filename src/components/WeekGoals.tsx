import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { startOfWeek, weekRangeLabel, type DayKey } from "@/lib/date";
import { loadGoals, newGoal, saveGoals, type WeekGoal } from "@/lib/focus";
import { subscribeJournal } from "@/lib/pageStore";
import { useOverlay } from "@/state/overlay";
import { Sheet } from "@/components/Sheet";
import "./week-goals.css";

interface Props {
  notebookId: string;
  date: DayKey;
}

/** There's always one more, blank line to write the next goal on — never a
 *  saved blank: `saveGoals` drops the empty ones on the way to storage. */
function withTrailingBlank(goals: WeekGoal[]): WeekGoal[] {
  const last = goals[goals.length - 1];
  if (!last || last.text.trim() !== "") return [...goals, newGoal()];
  return goals;
}

function unfinished(goals: WeekGoal[]): WeekGoal[] {
  return goals.filter((g) => g.text.trim() && !g.struck);
}

/** The tab on the edge of the paper.
 *
 *  What you mean to have done by Sunday doesn't belong on the page itself:
 *  a goal you have to read past every time you write a line is a goal that
 *  nags, and this is a notebook, not a performance review. So it lives
 *  where a bookmark lives — half out of the page, there when you look for
 *  it and quiet when you don't. The dots are the only thing it says from a
 *  distance: one per goal, filled once it is crossed off. */
export function GoalTab({ notebookId, date }: Props) {
  const [goals, setGoals] = useState<WeekGoal[]>([]);
  const show = useOverlay((s) => s.show);

  useEffect(() => {
    let alive = true;
    const read = () =>
      void loadGoals(notebookId, date).then((got) => {
        if (alive) setGoals(got.filter((g) => g.text.trim()));
      });
    read();
    const stop = subscribeJournal(read);
    return () => {
      alive = false;
      stop();
    };
  }, [notebookId, date]);

  const left = unfinished(goals).length;
  return (
    <button
      type="button"
      className="goaltab"
      title="This week's goals"
      aria-label={
        goals.length === 0
          ? "This week's goals — none written"
          : `This week's goals: ${left} of ${goals.length} still to do`
      }
      onClick={() => show("goals")}
    >
      <span className="goaltab__word">goals</span>
      {goals.length > 0 ? (
        <span className="goaltab__dots" aria-hidden="true">
          {goals.slice(0, 6).map((g) => (
            <span
              key={g.id}
              className={`goaltab__dot ${g.struck ? "goaltab__dot--done" : ""}`}
            />
          ))}
        </span>
      ) : null}
    </button>
  );
}

/** The card behind the tab: what this week is for, in as many lines as it
 *  takes. Nothing here is counted or matched against the page — a goal is
 *  written, and then it is crossed out or it isn't — and none of it
 *  carries forward: next Monday is a blank card, which is the point. */
export function WeekGoals({
  notebookId,
  date,
  onClose,
}: Props & { onClose: () => void }) {
  const weekStart = startOfWeek(date);
  const [goals, setGoals] = useState<WeekGoal[] | null>(null);
  const inputs = useRef<Map<string, HTMLInputElement>>(new Map());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // a row added by Enter isn't in the DOM yet when the handler runs
  const pendingFocus = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadGoals(notebookId, date).then((got) => {
      if (alive) setGoals(withTrailingBlank(got));
    });
    return () => {
      alive = false;
    };
  }, [notebookId, date]);

  useLayoutEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    inputs.current.get(id)?.focus();
  });

  // written on the way out as well as on a timer, so closing the card the
  // instant you stop typing doesn't lose the last thing you wrote
  const pending = useRef<WeekGoal[] | null>(null);
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (pending.current) void saveGoals(notebookId, date, pending.current);
    },
    [notebookId, date],
  );

  const commit = (next: WeekGoal[]) => {
    setGoals(next);
    pending.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      pending.current = null;
      void saveGoals(notebookId, date, next);
    }, 400);
  };

  const setText = (id: string, text: string) => {
    if (!goals) return;
    commit(
      withTrailingBlank(goals.map((g) => (g.id === id ? { ...g, text } : g))),
    );
  };

  const strike = (id: string) => {
    if (!goals) return;
    commit(goals.map((g) => (g.id === id ? { ...g, struck: !g.struck } : g)));
  };

  const drop = (id: string) => {
    if (!goals) return;
    commit(withTrailingBlank(goals.filter((g) => g.id !== id)));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>, i: number) => {
    if (!goals) return;
    if (e.key === "Enter") {
      e.preventDefault();
      const here = goals[i];
      // Enter on the standing blank row isn't "add one": it already sits
      // at the end with nothing to file in front of
      if (here.text.trim() === "" && i === goals.length - 1) return;
      const after = goals[i + 1];
      if (after && after.text.trim() === "") {
        inputs.current.get(after.id)?.focus();
        return;
      }
      const added = newGoal();
      pendingFocus.current = added.id;
      commit(
        withTrailingBlank([
          ...goals.slice(0, i + 1),
          added,
          ...goals.slice(i + 1),
        ]),
      );
      return;
    }
    if (e.key === "Backspace" && goals[i].text === "" && i > 0) {
      e.preventDefault();
      const before = goals[i - 1];
      drop(goals[i].id);
      inputs.current.get(before.id)?.focus();
    }
  };

  return (
    <Sheet label="This week's goals" onClose={onClose}>
      <h2 className="sheet__title wgoals__title">
        This week
        <span className="wgoals__dates">{weekRangeLabel(weekStart)}</span>
      </h2>

      <div className="sheet__body">
        <ul className="wgoals__list">
          {(goals ?? []).map((goal, i) => (
            <li
              key={goal.id}
              className={`wgoals__row ${goal.struck ? "wgoals__row--done" : ""}`}
            >
              <button
                type="button"
                className="wgoals__mark"
                aria-pressed={goal.struck === true}
                aria-label={
                  goal.struck ? `Not done: ${goal.text}` : `Done: ${goal.text}`
                }
                disabled={!goal.text.trim()}
                onClick={() => strike(goal.id)}
              >
                {goal.struck ? "✓" : "◇"}
              </button>
              <input
                ref={(el) => {
                  if (el) inputs.current.set(goal.id, el);
                  else inputs.current.delete(goal.id);
                }}
                className="wgoals__input"
                type="text"
                value={goal.text}
                placeholder={i === 0 ? "What is this week for?" : ""}
                aria-label={`Goal ${i + 1}`}
                onChange={(e) => setText(goal.id, e.target.value)}
                onKeyDown={(e) => onKeyDown(e, i)}
              />
              <span className="wgoals__strike" aria-hidden="true" />
              {goal.text.trim() ? (
                <button
                  type="button"
                  className="wgoals__drop"
                  aria-label={`Remove ${goal.text}`}
                  title="Remove"
                  onClick={() => drop(goal.id)}
                >
                  ×
                </button>
              ) : (
                <span className="wgoals__drop" aria-hidden="true" />
              )}
            </li>
          ))}
        </ul>
        <p className="wgoals__note">
          Goals belong to this week only — Monday starts a blank card.
        </p>
      </div>
    </Sheet>
  );
}
