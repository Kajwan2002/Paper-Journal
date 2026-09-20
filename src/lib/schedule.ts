import { db, getPage, pageId } from "@/lib/db";
import { flushAsync, getCached, prime, writeLines } from "@/lib/pageStore";
import type { DayKey } from "@/lib/date";
import { childRangeOf, isOpenTask, type Line } from "@/lib/rapidlog";

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

  const relocate = (l: Line): Line => ({
    ...l,
    carriedTo: undefined,
    due: undefined,
    someday: undefined,
    rolls: 0,
    origin: l.origin ?? from,
    // landing fresh on a different page — whatever position it held on
    // the page it came from has nothing to do with where it belongs here.
    // Clearing it rather than stamping a fresh wall-clock number matters:
    // that scale is enormous next to the array-index scale a plain page
    // sorts by, so every moved line would permanently outrank anything
    // typed after it. Falling back to plain array position (the block is
    // appended to the end of the target day) is simpler and correct.
    order: undefined,
  });

  // the list gathered under it goes too — "DM Shopping" on its own, with
  // the three things you meant to buy left behind on yesterday's page
  // indented under nothing, is not what "move this to tomorrow" meant
  const here = getCached(pageId(notebookId, from)) ?? [];
  const at = here.findIndex((l) => l.id === line.id);
  const children = at < 0 ? [] : here.slice(...childRangeOf(here, at));
  const block = [relocate(line), ...children.map(relocate)];
  const moving = new Set(block.map((l) => l.id));

  const target = getCached(pageId(notebookId, to)) ?? [];
  const keep = (l: Line) => l.text.trim().length > 0 && !moving.has(l.id);
  // re-filing something already on the target day leaves it where it sits
  const wasAt = target.findIndex((l) => l.id === line.id);
  const rest = target.filter(keep);
  const insertAt =
    wasAt < 0 ? rest.length : target.slice(0, wasAt).filter(keep).length;

  writeLines(notebookId, to, [
    ...rest.slice(0, insertAt),
    ...block,
    ...rest.slice(insertAt),
  ]);

  // and off the day you wrote it — you sent it forward to stop seeing it.
  // Through writeLines, not a raw adopt+savePage: writeLines is what turns
  // a line dropped from the array into a tombstone. Without one, a sync
  // pull that still has this day's pre-move copy — the other device simply
  // hasn't seen the move yet, or even this same device's own last push —
  // had no way to tell "removed on purpose" from "never received", and put
  // the task right back a few seconds later.
  writeLines(
    notebookId,
    from,
    here.filter((l) => !moving.has(l.id)),
  );

  await flushAsync();
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
