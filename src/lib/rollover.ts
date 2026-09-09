import { db, pageId, type Page } from "@/lib/db";
import { adopt, commitRollover, getCached } from "@/lib/pageStore";
import { addDays, todayKey, type DayKey } from "@/lib/date";
import { isOpenTask, type Line } from "@/lib/rapidlog";

/** Task rollover / migration.
 *
 *  Every unfinished task or priority left on a past page is carried forward
 *  to today, drawn as a `›` (migrated). There is only ever ONE live copy of
 *  an unfinished item — each morning it moves to today, and the day it
 *  leaves keeps a permanent `›` breadcrumb stamped `carriedTo`. The
 *  `carriedTo` stamp is what makes this idempotent and deletion-safe: a
 *  stamped line is an old breadcrumb, never a live task.
 *
 *  This only ever targets `todayKey()`, and only runs from App on load and
 *  on the overnight wake — never from opening an arbitrary page. */

export const ROLLOVER_WINDOW_DAYS = 30;
export const NAG_CAP = 4;

const inflight = new Map<string, Promise<void>>();

function linesFor(notebookId: string, page: Page): Line[] {
  return getCached(pageId(notebookId, page.date)) ?? page.lines;
}

export function rolloverToToday(notebookId: string): Promise<void> {
  const today = todayKey();
  const key = `${notebookId}__${today}`;
  const running = inflight.get(key);
  if (running) return running;
  const job = run(notebookId, today).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

async function run(notebookId: string, today: DayKey): Promise<void> {
  const start = addDays(today, -ROLLOVER_WINDOW_DAYS);

  const past = (await db.pages
    .where("[notebookId+date]")
    .between([notebookId, start], [notebookId, today], true, false)
    .toArray()) as Page[];
  past.sort((a, b) => (a.date < b.date ? -1 : 1));

  const carried: Line[] = [];
  const rewrites = new Map<DayKey, Line[]>();

  for (const page of past) {
    const base = linesFor(notebookId, page);
    let changed = false;
    const next = base.map((line) => {
      if (isOpenTask(line) && !line.carriedTo) {
        carried.push({
          ...line,
          kind: "migrated",
          carriedTo: undefined,
          rolls: (line.rolls ?? 0) + 1,
          origin: line.origin ?? page.date,
        });
        changed = true;
        return { ...line, kind: "migrated" as const, carriedTo: today };
      }
      return line;
    });
    if (changed) rewrites.set(page.date, next);
  }

  if (carried.length === 0) return; // nothing to carry — touch nothing

  const todayId = pageId(notebookId, today);
  const todayBase = (
    getCached(todayId) ??
    (await db.pages.get(todayId))?.lines ??
    []
  ).filter((l) => l.text.trim().length > 0);
  const seen = new Set(todayBase.map((l) => l.id));
  const fresh = carried.filter((c) => !seen.has(c.id));
  if (fresh.length === 0 && rewrites.size === 0) return;

  const merged = [...todayBase, ...fresh];

  await db.transaction("rw", db.pages, async () => {
    const now = Date.now();
    for (const [date, lines] of rewrites) {
      await db.pages.put({
        id: pageId(notebookId, date),
        notebookId,
        date,
        lines,
        updatedAt: now,
      });
    }
    await db.pages.put({
      id: todayId,
      notebookId,
      date: today,
      lines: merged,
      updatedAt: now,
    });
  });

  for (const [date, lines] of rewrites) adopt(notebookId, date, lines);
  commitRollover(notebookId, today, merged);
}
