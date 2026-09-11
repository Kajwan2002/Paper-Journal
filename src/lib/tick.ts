import { pageId } from "@/lib/db";
import { getCached, prime, writeLines } from "@/lib/pageStore";
import { setStruckAcrossChain } from "@/lib/chain";
import { isStruck, toggleWithChildren, type Line } from "@/lib/rapidlog";
import type { DayKey } from "@/lib/date";

/** Cross a line off from wherever you happen to be looking at it.
 *
 *  The daily page, Open Loops and the coming-up note all show the same
 *  tasks, and ticking one should mean the same thing in all three: toggle
 *  the copy on its own page — cascading onto its indented children, if it
 *  has any — then carry each changed line back through every day rollover
 *  dragged it across. */
export async function toggleStruck(
  notebookId: string,
  date: DayKey,
  line: Line,
): Promise<void> {
  await prime(notebookId, date);
  const lines = getCached(pageId(notebookId, date)) ?? [];
  const before = new Map(lines.map((l) => [l.id, isStruck(l)]));
  const after = toggleWithChildren(lines, line.id);
  writeLines(notebookId, date, after);
  for (const next of after) {
    const was = before.get(next.id);
    if (was !== undefined && isStruck(next) !== was) {
      await setStruckAcrossChain(notebookId, next, isStruck(next), date);
    }
  }
}
