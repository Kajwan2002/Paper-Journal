import { db } from "@/lib/db";

export interface Reconciled {
  /** the notebook this device should switch to, if it is staring at the
   *  wrong one — otherwise null */
  adopt: string | null;
  /** untouched seeds that were binned, so a caller holding a copy of the
   *  shelf elsewhere can bin them there too */
  removed: string[];
}

/** Every device seeds itself a "Journal" on first run, before it has any
 *  idea another one exists — so pairing unions two empty-ish notebooks and
 *  each device carries on showing its own. Pick the one that actually has
 *  writing in it, and bin an untouched seed rather than leaving a confusing
 *  second notebook on the shelf. Nothing with a page in it is ever removed.
 *
 *  Both sync transports need this and neither owns it: a journal that
 *  arrives is a journal that arrives, however it got here. */
export async function reconcileNotebooks(
  currentId: string | null,
): Promise<Reconciled> {
  const notebooks = await db.notebooks.orderBy("order").toArray();
  if (notebooks.length < 2) return { adopt: null, removed: [] };

  const counts = new Map<string, number>();
  for (const nb of notebooks) {
    counts.set(nb.id, await db.pages.where("notebookId").equals(nb.id).count());
  }

  const written = notebooks.filter((n) => (counts.get(n.id) ?? 0) > 0);
  const adopt =
    currentId && (counts.get(currentId) ?? 0) > 0
      ? null
      : (written[0]?.id ?? null);

  // an empty seed is only ever in the way once a written notebook exists
  const removed: string[] = [];
  if (written.length > 0) {
    for (const nb of notebooks) {
      if ((counts.get(nb.id) ?? 0) > 0) continue;
      if (nb.id === (adopt ?? currentId)) continue;
      await db.notebooks.delete(nb.id);
      removed.push(nb.id);
    }
  }

  return { adopt, removed };
}
