import { pageId } from "@/lib/db";
import { getCached, prime, writeLines } from "@/lib/pageStore";
import { setStruckAcrossChain } from "@/lib/chain";
import { isStruck, tapSignifier, type Line } from "@/lib/rapidlog";
import type { DayKey } from "@/lib/date";

/** Cross a line off from wherever you happen to be looking at it.
 *
 *  The daily page, Open Loops and the coming-up note all show the same
 *  tasks, and ticking one should mean the same thing in all three: toggle
 *  the copy on its own page, then carry the result back through every day
 *  rollover dragged it across. */
export async function toggleStruck(
  notebookId: string,
  date: DayKey,
  line: Line,
): Promise<void> {
  await prime(notebookId, date);
  const lines = getCached(pageId(notebookId, date)) ?? [];
  const after = tapSignifier(line);
  writeLines(
    notebookId,
    date,
    lines.map((l) => (l.id === line.id ? after : l)),
  );
  if (isStruck(after) !== isStruck(line)) {
    await setStruckAcrossChain(notebookId, after, isStruck(after), date);
  }
}
