import { db, pageId, type Page } from "@/lib/db";
import { adopt, flushAsync, getCached } from "@/lib/pageStore";
import { savePage } from "@/lib/db";
import type { DayKey } from "@/lib/date";
import type { Line } from "@/lib/rapidlog";

/** Striking a task should strike it everywhere it has been.
 *
 *  A task carried forward — by rollover each morning, or because you filed
 *  it for a later day — leaves a `›` breadcrumb on every page it passed
 *  through, and each copy keeps the same line id. Ticking off the live copy
 *  used to mark only that page, so leafing back through the week showed a
 *  row of tasks apparently still outstanding, when they were done days ago.
 *
 *  The chain only ever runs forward from the day a task was first written,
 *  so `origin` bounds the search; without one we fall back to the whole
 *  notebook, which is still just a handful of small local records. */
export async function setStruckAcrossChain(
  notebookId: string,
  line: Line,
  struck: boolean,
  /** the page the reader actually ticked — it writes itself */
  except: DayKey,
): Promise<void> {
  await flushAsync();

  const from = line.origin ?? "0000-00-00";
  const to = except;
  // nothing can be earlier than where it started
  if (from > to) return;

  const pages = (await db.pages
    .where("[notebookId+date]")
    .between([notebookId, from], [notebookId, to], true, true)
    .toArray()) as Page[];

  for (const page of pages) {
    if (page.date === except) continue;
    const base = getCached(pageId(notebookId, page.date)) ?? page.lines;
    let changed = false;
    const next = base.map((l) => {
      if (l.id !== line.id || l.struck === struck) return l;
      changed = true;
      // only the strike travels: the breadcrumb keeps its `carriedTo`, so
      // it still reads as "this moved on", now visibly settled
      return { ...l, struck };
    });
    if (!changed) continue;
    adopt(notebookId, page.date, next);
    await savePage(notebookId, page.date, next);
  }
}
