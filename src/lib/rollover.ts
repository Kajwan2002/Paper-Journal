import { db, pageId, type Page } from "@/lib/db";
import {
  adopt,
  commitRollover,
  flushAsync,
  getCached,
  revision,
} from "@/lib/pageStore";
import { todayKey, type DayKey } from "@/lib/date";
import { isDue, isOpenTask, type Line } from "@/lib/rapidlog";

/** Task rollover / migration.
 *
 *  Every unfinished task or priority left on a past page is carried forward
 *  to today, drawn as a `›` (migrated). There is only ever ONE live copy of
 *  an unfinished item — each morning it moves to today, and the day it
 *  leaves keeps a permanent `›` breadcrumb stamped `carriedTo`. The
 *  `carriedTo` stamp is what makes this idempotent and deletion-safe: a
 *  stamped line is an old breadcrumb, never a live task.
 *
 *  A task scheduled for a later day (`due`) or parked in someday sits
 *  quietly where it was written and is not carried until its day arrives.
 *
 *  This only ever targets `todayKey()`, and only runs from App on load, on
 *  the overnight wake, and on the midnight tick — never from opening an
 *  arbitrary page. */

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
  const job = attempt(notebookId, today).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

/** Run, and run once more if the user typed on one of the pages involved
 *  while we were mid-flight — the second pass starts from their edit. */
async function attempt(notebookId: string, today: DayKey): Promise<void> {
  if (await run(notebookId, today)) return;
  await run(notebookId, today);
}

/** Returns false if a concurrent edit made this pass stale. */
async function run(notebookId: string, today: DayKey): Promise<boolean> {
  // Land every debounced edit first. Rollover rewrites whole pages, so it
  // must not start from a page whose last sentence is still in a timer.
  await flushAsync();

  // No window: an unfinished task is unfinished however long ago it was
  // written. Capping the scan at 30 days meant coming back from a six-week
  // break silently orphaned everything older.
  const past = (await db.pages
    .where("[notebookId+date]")
    .between([notebookId, "0000-00-00"], [notebookId, today], true, false)
    .toArray()) as Page[];
  past.sort((a, b) => (a.date < b.date ? -1 : 1));

  const carried: Line[] = [];
  const rewrites = new Map<DayKey, Line[]>();

  for (const page of past) {
    const base = linesFor(notebookId, page);
    let changed = false;
    const next = base.map((line) => {
      if (!line.carriedTo && isDue(line, today)) {
        carried.push({
          ...line,
          kind: "migrated",
          carriedTo: undefined,
          due: undefined, // its day has come; it is simply open now
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

  if (carried.length === 0) return true; // nothing to carry — touch nothing

  const todayId = pageId(notebookId, today);
  const todayBase = (
    getCached(todayId) ??
    (await db.pages.get(todayId))?.lines ??
    []
  ).filter((l) => l.text.trim().length > 0);
  const seen = new Set(todayBase.map((l) => l.id));
  const fresh = carried.filter((c) => !seen.has(c.id));
  if (fresh.length === 0 && rewrites.size === 0) return true;

  const merged = [...todayBase, ...fresh];

  // snapshot every page we are about to overwrite
  const touched = [today, ...rewrites.keys()];
  const before = new Map(
    touched.map((d) => {
      const k = pageId(notebookId, d);
      return [k, revision(k)];
    }),
  );

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

  const stale = [...before].some(([k, r]) => revision(k) !== r);
  if (stale) return false; // someone typed; redo from their version

  for (const [date, lines] of rewrites) adopt(notebookId, date, lines);
  commitRollover(notebookId, today, merged);
  return true;
}

/** Every unfinished commitment in the notebook, newest page first — what
 *  Open Loops shows. Includes scheduled and someday items, tagged so the
 *  view can group them. */
export interface Loop {
  date: DayKey;
  line: Line;
  /** false once a later copy exists — the breadcrumb, not the live task */
  live: boolean;
}

export async function openLoops(notebookId: string): Promise<Loop[]> {
  await flushAsync();
  const pages = await db.pages.where("notebookId").equals(notebookId).toArray();
  const out: Loop[] = [];
  for (const page of pages) {
    const lines = getCached(pageId(notebookId, page.date)) ?? page.lines;
    for (const line of lines) {
      if (!isOpenTask(line) || line.carriedTo) continue;
      out.push({ date: page.date, line, live: true });
    }
  }
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out;
}
