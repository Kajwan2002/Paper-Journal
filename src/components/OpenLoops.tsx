import { useEffect, useState } from "react";
import { getCached, prime, writeLines } from "@/lib/pageStore";
import { pageId } from "@/lib/db";
import { openLoops, type Loop } from "@/lib/rollover";
import { setStruckAcrossChain } from "@/lib/chain";
import { glyphFor, isStruck, tapSignifier, type Line } from "@/lib/rapidlog";
import { relativeDay, todayKey, type DayKey } from "@/lib/date";
import { useSession } from "@/state/session";
import { Sheet } from "@/components/Sheet";
import "./open-loops.css";

interface Props {
  notebookId: string;
  onClose: () => void;
}

type Bucket = "due" | "later" | "someday";

function bucketOf(line: Line, date: DayKey, today: DayKey): Bucket {
  if (line.someday) return "someday";
  // filed for a later day means it is sitting on that day's page
  if (date > today) return "later";
  if (line.due && line.due > today) return "later";
  return "due";
}

const HEADINGS: Record<Bucket, string> = {
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
  const goToDate = useSession((s) => s.goToDate);
  const today = todayKey();

  const reload = () => {
    void openLoops(notebookId).then(setLoops);
  };
  useEffect(reload, [notebookId]);

  /** Edit a line in place, on whatever page it actually lives on. */
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

  const visit = (date: DayKey) => {
    goToDate(date);
    void prime(notebookId, date);
    onClose();
  };

  const buckets: Bucket[] = ["due", "later", "someday"];
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
                  {items.map(({ date, line }) => (
                    <li key={`${date}-${line.id}`} className="loops__item">
                      <button
                        type="button"
                        className="loops__tick"
                        aria-label={`Mark done: ${line.text}`}
                        onClick={() => {
                          const after = tapSignifier(line);
                          void patch(date, line.id, () => after).then(() =>
                            setStruckAcrossChain(
                              notebookId,
                              after,
                              isStruck(after),
                              date,
                            ).then(reload),
                          );
                        }}
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
                          {line.due
                            ? ` · for ${relativeDay(line.due, today)}`
                            : ""}
                        </span>
                      </button>
                      {bucket === "someday" ? (
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
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </Sheet>
  );
}
