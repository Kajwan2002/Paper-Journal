import { useEffect, useState } from "react";
import { getCached, prime, writeLines } from "@/lib/pageStore";
import { pageId } from "@/lib/db";
import { openLoops, type Loop } from "@/lib/rollover";
import { toggleStruck } from "@/lib/tick";
import { glyphFor, isStruck, type Line } from "@/lib/rapidlog";
import {
  addDays,
  endOfMonth,
  nextWeekday,
  relativeDay,
  todayKey,
  type DayKey,
} from "@/lib/date";
import { deadlineLabel, urgencyOf } from "@/lib/deadline";
import { useSession } from "@/state/session";
import { Sheet } from "@/components/Sheet";
import { DayPicker } from "@/components/DayPicker";
import "./open-loops.css";

interface Props {
  notebookId: string;
  onClose: () => void;
}

type Bucket = "deadline" | "due" | "later" | "someday";

function bucketOf(line: Line, date: DayKey, today: DayKey): Bucket {
  if (line.someday) return "someday";
  // a deadline outranks where the task happens to sit — it is the thing
  // that runs out
  if (line.deadline && urgencyOf(line.deadline, today) !== "later") {
    return "deadline";
  }
  // filed for a later day means it is sitting on that day's page
  if (date > today) return "later";
  if (line.due && line.due > today) return "later";
  return "due";
}

const HEADINGS: Record<Bucket, string> = {
  deadline: "Running out of time",
  due: "Asking for you",
  later: "Filed for later",
  someday: "Someday",
};

/** Every unfinished commitment in the notebook, on one page.
 *
 *  A paper journal can't do this — finding an old task means remembering it
 *  exists and then leafing. It is the single most useful thing software adds
 *  to the method, so it gets a ribbon of its own rather than being buried
 *  behind a search query. */
export function OpenLoops({ notebookId, onClose }: Props) {
  const [loops, setLoops] = useState<Loop[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // a someday task has no page of its own to open the line menu on — this
  // is the same deadline picker, just reachable from here instead
  const [deadlineFor, setDeadlineFor] = useState<string | null>(null);
  const [pickingDay, setPickingDay] = useState(false);
  const goToDate = useSession((s) => s.goToDate);
  const today = todayKey();

  const byWhen: Array<[string, DayKey]> = [
    ["End of this week", nextWeekday(today, 0)],
    ["In two weeks", addDays(today, 14)],
    ["End of the month", endOfMonth(today)],
  ];

  const reload = () => {
    void openLoops(notebookId).then(setLoops);
  };
  useEffect(reload, [notebookId]);

  /** Edit a line in place, on whatever page it actually lives on. Used for
   *  the someday / pick-up toggle and for setting a deadline from here —
   *  striking a line goes through the shared `toggleStruck`, which also
   *  cascades onto its children. */
  const patch = async (
    date: DayKey,
    id: string,
    change: (line: Line) => Line,
  ) => {
    await prime(notebookId, date);
    const lines = getCached(pageId(notebookId, date)) ?? [];
    writeLines(
      notebookId,
      date,
      lines.map((l) => (l.id === id ? change(l) : l)),
    );
    reload();
  };

  const setDeadline = (
    date: DayKey,
    id: string,
    deadline: DayKey | undefined,
  ) => {
    void patch(date, id, (l) => ({ ...l, deadline }));
    setDeadlineFor(null);
    setPickingDay(false);
  };

  const visit = (date: DayKey) => {
    goToDate(date);
    void prime(notebookId, date);
    onClose();
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const buckets: Bucket[] = ["deadline", "due", "later", "someday"];
  const grouped = new Map<Bucket, Loop[]>(
    buckets.map((b) => [
      b,
      (loops ?? []).filter((l) => bucketOf(l.line, l.date, today) === b),
    ]),
  );

  return (
    <Sheet label="Open loops" onClose={onClose} wide>
      <h2 className="sheet__title">Open loops</h2>
      <div className="sheet__body">
        {loops === null ? null : loops.length === 0 ? (
          <p className="sheet__empty">Nothing is outstanding. Rare and good.</p>
        ) : (
          buckets.map((bucket) => {
            const items = grouped.get(bucket) ?? [];
            if (items.length === 0) return null;
            return (
              <section key={bucket} className="loops__group">
                <h3 className="loops__heading">
                  {HEADINGS[bucket]}
                  <span className="loops__n">{items.length}</span>
                </h3>
                <ul className="loops__list">
                  {items.map(({ date, line, children }) => {
                    const hasChildren = children.length > 0;
                    const isOpen = expanded.has(line.id);
                    return (
                      <li
                        key={`${date}-${line.id}`}
                        className="loops__group-item"
                      >
                        <div className="loops__item">
                          <button
                            type="button"
                            className="loops__tick"
                            aria-label={`Mark done: ${line.text}`}
                            onClick={() =>
                              void toggleStruck(notebookId, date, line).then(
                                reload,
                              )
                            }
                          >
                            {glyphFor(line)}
                          </button>
                          <button
                            type="button"
                            className="loops__text"
                            onClick={() => visit(date)}
                          >
                            <span className="loops__body">{line.text}</span>
                            <span className="loops__meta">
                              {relativeDay(line.origin ?? date, today)}
                              {line.rolls && line.rolls > 1
                                ? ` · carried ${line.rolls}×`
                                : ""}
                              {line.deadline
                                ? ` · ${deadlineLabel(line.deadline, today)}`
                                : ""}
                              {date > today
                                ? ` · for ${relativeDay(date, today)}`
                                : ""}
                            </span>
                          </button>
                          {hasChildren ? (
                            <button
                              type="button"
                              className="loops__disclose"
                              aria-expanded={isOpen}
                              aria-label={
                                isOpen
                                  ? "Hide the list"
                                  : `Show ${children.length} items`
                              }
                              onClick={() => toggleExpanded(line.id)}
                            >
                              {isOpen ? "▾" : "▸"}
                              <span className="loops__disclose-n">
                                {children.length}
                              </span>
                            </button>
                          ) : null}
                          {bucket === "someday" ? (
                            <div className="loops__actions">
                              <button
                                type="button"
                                className="loops__act"
                                onClick={() =>
                                  void patch(date, line.id, (l) => ({
                                    ...l,
                                    someday: undefined,
                                    due: undefined,
                                  }))
                                }
                              >
                                pick up
                              </button>
                              <button
                                type="button"
                                className="loops__act"
                                aria-expanded={deadlineFor === line.id}
                                onClick={() =>
                                  setDeadlineFor((cur) => {
                                    setPickingDay(false);
                                    return cur === line.id ? null : line.id;
                                  })
                                }
                              >
                                {line.deadline ? "deadline" : "set deadline"}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="loops__act"
                              onClick={() =>
                                void patch(date, line.id, (l) => ({
                                  ...l,
                                  someday: true,
                                  due: undefined,
                                  rolls: 0,
                                }))
                              }
                            >
                              someday
                            </button>
                          )}
                        </div>

                        {bucket === "someday" && deadlineFor === line.id ? (
                          <div className="loops__deadline">
                            {pickingDay ? (
                              <DayPicker
                                value={line.deadline ?? today}
                                onPick={(d) => setDeadline(date, line.id, d)}
                                autoFocus
                              />
                            ) : (
                              <>
                                {byWhen.map(([label, day]) => (
                                  <button
                                    key={label}
                                    type="button"
                                    className="loops__deadline-opt"
                                    onClick={() =>
                                      setDeadline(date, line.id, day)
                                    }
                                  >
                                    {label}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  className="loops__deadline-opt"
                                  onClick={() => setPickingDay(true)}
                                >
                                  Pick a day…
                                </button>
                                {line.deadline ? (
                                  <button
                                    type="button"
                                    className="loops__deadline-opt loops__deadline-opt--clear"
                                    onClick={() =>
                                      setDeadline(date, line.id, undefined)
                                    }
                                  >
                                    Clear deadline
                                  </button>
                                ) : null}
                              </>
                            )}
                          </div>
                        ) : null}

                        {hasChildren && isOpen ? (
                          <ul className="loops__children">
                            {children.map((child) => (
                              <li
                                key={child.id}
                                className="loops__child"
                                data-struck={isStruck(child) ? "1" : "0"}
                              >
                                <button
                                  type="button"
                                  className="loops__tick loops__tick--child"
                                  aria-label={`Mark done: ${child.text}`}
                                  onClick={() =>
                                    void toggleStruck(
                                      notebookId,
                                      date,
                                      child,
                                    ).then(reload)
                                  }
                                >
                                  {glyphFor(child)}
                                </button>
                                <button
                                  type="button"
                                  className="loops__child-text"
                                  onClick={() => visit(date)}
                                >
                                  {child.text}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </Sheet>
  );
}
