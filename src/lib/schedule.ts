import { db, getPage, pageId } from "@/lib/db";
import {
  adopt,
  flushAsync,
  getCached,
  prime,
  writeLines,
} from "@/lib/pageStore";
import { savePage } from "@/lib/db";
import type { DayKey } from "@/lib/date";
import { isOpenTask, type Line } from "@/lib/rapidlog";

/** Filing something for a later day *moves* it there.
 *
 *  It used to sit where it was written, marked with a chip, and only appear
 *  on its day — so flipping forward to see the week ahead showed empty
 *  pages, which is the opposite of what a planner is for. Now the task goes
 *  onto the day you chose and off the day you wrote it: sending something
 *  forward is a decision not to look at it today, so leaving a breadcrumb
 *  behind just puts it back in front of you.
 *
 *  This is deliberately unlike rollover, which *does* leave a `›` on every
 *  morning it carries something through — those breadcrumbs are the record
 *  of work you kept not getting to, and they are what makes leafing back
 *  over a week readable. A move you chose is not that.
 *
 *  Copies still share one line id, which is what lets a strike settle the
 *  rest of the chain later. */
export async function moveLineTo(
  notebookId: string,
  from: DayKey,
  line: Line,
  to: DayKey,
): Promise<void> {
  // filing something for today or the past just means "it's open now"
  if (to <= from) {
    const here = getCached(pageId(notebookId, from)) ?? [];
    writeLines(
      notebookId,
      from,
      here.map((l) =>
        l.id === line.id
          ? { ...l, due: undefined, someday: undefined, rolls: 0 }
          : l,
      ),
    );
    return;
  }

  await flushAsync();
  await prime(notebookId, to);

  const live: Line = {
    ...line,
    carriedTo: undefined,
    due: undefined,
    someday: undefined,
    rolls: 0,
    origin: line.origin ?? from,
  };

  const target = getCached(pageId(notebookId, to)) ?? [];
  const already = target.some((l) => l.id === line.id);
  const nextTarget = already
    ? target.map((l) => (l.id === line.id ? live : l))
    : [...target.filter((l) => l.text.trim().length > 0), live];

  adopt(notebookId, to, nextTarget);
  await savePage(notebookId, to, nextTarget);

  // and off the day you wrote it — you sent it forward to stop seeing it
  const here = getCached(pageId(notebookId, from)) ?? [];
  const nextHere = here.filter((l) => l.id !== line.id);
  adopt(notebookId, from, nextHere);
  await savePage(notebookId, from, nextHere);
}

/** One-time repair for journals written before scheduling moved anything.
 *
 *  Those tasks are still sitting on the page they were written on with a
 *  `due` stamp, invisible on the day they were filed for. Walk them onto
 *  their day so the week ahead reads correctly. Idempotent: once moved,
 *  a line carries `carriedTo` and is skipped. */
export async function settleLegacySchedules(notebookId: string): Promise<void> {
  await flushAsync();
  const pages = await db.pages.where("notebookId").equals(notebookId).toArray();

  for (const page of pages) {
    const lines = getCached(pageId(notebookId, page.date)) ?? page.lines;
    const pending = lines.filter(
      (l) => l.due && l.due > page.date && !l.carriedTo && isOpenTask(l),
    );
    for (const line of pending) {
      await moveLineTo(notebookId, page.date, line, line.due!);
    }
  }
}

/** Everything scheduled onto a given day that hasn't happened yet — used to
 *  answer "is there anything on this page" without loading it. */
export async function hasWriting(
  notebookId: string,
  date: DayKey,
): Promise<boolean> {
  const cached = getCached(pageId(notebookId, date));
  if (cached) return cached.some((l) => l.text.trim().length > 0);
  const page = await getPage(notebookId, date);
  return !!page?.lines.some((l) => l.text.trim().length > 0);
}
