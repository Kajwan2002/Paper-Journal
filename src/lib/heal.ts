import { db, pageId, type Page } from "@/lib/db";
import { flushAsync, getCached, prime, writeLines } from "@/lib/pageStore";
import type { DayKey } from "@/lib/date";
import type { Line } from "@/lib/rapidlog";

/** One live copy of a line, in the whole journal.
 *
 *  Every line carries an id that follows it wherever it goes — that is
 *  what lets a strike settle a task's whole chain at once, and what lets
 *  two devices agree about a page. It only works while exactly one page
 *  holds the live copy. Two pages holding it is not a disagreement the
 *  merge can settle: the merge works *within* a page, so neither copy can
 *  see the other, both keep syncing, and crossing one off or deleting it
 *  leaves the other standing. That reads, from the chair, as "there are
 *  two of this and I can't delete it".
 *
 *  A move is supposed to be the one thing that can't leave two: it writes
 *  the line onto its new page and a tombstone onto the old one, both
 *  freshly stamped. But a move happens across two pages and so across two
 *  documents, and anything that keeps the second one from landing — the
 *  app closed in between, a sync that was refused halfway, a device that
 *  was away for the tombstone and came back with its own copy — leaves the
 *  journal holding two. So the invariant can't only be written carefully;
 *  it has to be swept for.
 *
 *  A breadcrumb is not a second copy. Rollover deliberately leaves the old
 *  page a `›` stamped `carriedTo` — the record of a morning it was carried
 *  through — and that is the one case where an id legitimately appears
 *  twice. It is identified by `carriedTo`, exactly as rollover identifies
 *  it, and never touched here. */

/** Live, as against a tombstone, a blank, or a breadcrumb left behind. */
function isLive(line: Line): boolean {
  return !line.deletedAt && !line.carriedTo && line.text.trim().length > 0;
}

/** The stamp that decides which copy is the real one: the newest thing
 *  that happened to it. A moved line is stamped on arrival, so the copy
 *  you moved last is the copy that wins — which is what you meant. */
function stampOf(line: Line): number {
  return Math.max(line.editedAt ?? 0, line.orderedAt ?? 0);
}

export interface Healed {
  /** line ids that had more than one live copy */
  ids: string[];
  /** pages the extra copies were taken off */
  pages: DayKey[];
}

/** Find every line that is live on more than one page and leave only the
 *  newest-stamped one, as a deletion the other devices will agree with
 *  rather than a silent removal. Idempotent, and a no-op on a journal that
 *  is already sound — which is nearly always. */
export async function healDoubles(notebookId: string): Promise<Healed> {
  await flushAsync();
  const pages = (await db.pages
    .where("notebookId")
    .equals(notebookId)
    .toArray()) as Page[];

  const changed: DayKey[] = [];
  /** line id → where it is live */
  const seen = new Map<string, Array<{ date: DayKey; line: Line }>>();
  for (const page of pages) {
    const lines = getCached(pageId(notebookId, page.date)) ?? page.lines;
    for (const line of lines) {
      if (!isLive(line)) continue;
      const found = seen.get(line.id);
      if (found) found.push({ date: page.date, line });
      else seen.set(line.id, [{ date: page.date, line }]);
    }
  }

  /** line id → the one copy that stays */
  const keeper = new Map<string, { date: DayKey; line: Line }>();
  const ids: string[] = [];
  for (const [id, copies] of seen) {
    if (copies.length < 2) continue;
    ids.push(id);
    keeper.set(
      id,
      [...copies].sort(
        (a, b) =>
          stampOf(b.line) - stampOf(a.line) ||
          // nothing to tell them apart but the day: keep the later page,
          // since a journal is read forwards and that is the copy in
          // front of you
          (a.date < b.date ? 1 : -1),
      )[0],
    );
  }

  const touched = [
    ...new Set(ids.flatMap((id) => seen.get(id)!.map((c) => c.date))),
  ];

  for (const date of touched) {
    await prime(notebookId, date);
    const here = getCached(pageId(notebookId, date)) ?? [];
    // Walked rather than filtered by id: when both copies are on this
    // same page, filtering by id would take the one we meant to keep
    // along with the one we meant to drop, and the line would vanish
    // altogether.
    const kept = new Set<string>();
    const next = here.filter((line) => {
      // tombstones and rollover breadcrumbs are not copies; leave them
      if (!isLive(line)) return true;
      const mine = keeper.get(line.id);
      if (!mine) return true;
      if (mine.date !== date) return false;
      if (kept.has(line.id)) return false;
      if (stampOf(line) !== stampOf(mine.line)) return false;
      kept.add(line.id);
      return true;
    });
    if (next.length === here.length) continue;
    // through writeLines, so each one leaves a tombstone: a bare removal
    // would read to the other device as a page it simply hasn't been told
    // about, and the copy would be back within seconds
    writeLines(notebookId, date, next);
    changed.push(date);
  }

  if (changed.length > 0) await flushAsync();

  return { ids, pages: changed };
}
