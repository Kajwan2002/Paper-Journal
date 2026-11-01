import { db } from "@/lib/db";
import { notifyJournal } from "@/lib/pageStore";
import { isIconId, type IconId } from "@/lib/icons";
import type { Learned } from "@/lib/iconfor";

/** What the notebook has been taught about which word means which drawing.
 *
 *  One row per word, so two devices teaching different words both keep
 *  what they learned, and two devices teaching the *same* word settle it
 *  the way this app settles everything — per item, newest wins. Teaching
 *  it to draw nothing is a row with a null icon rather than no row at all,
 *  for the same reason a cleared week note keeps its row: an absent row
 *  cannot win a merge against a stale one. */

export async function teach(word: string, icon: IconId | null): Promise<void> {
  const id = word.trim().toLowerCase();
  if (!id) return;
  await db.iconWords.put({ id, icon, updatedAt: Date.now() });
  // this write goes straight to storage, behind the page cache's back, so
  // nothing else would know to send it to the other device
  notifyJournal();
}

export async function loadLearned(): Promise<Learned> {
  return asLearned(await db.iconWords.toArray());
}

export function asLearned(
  rows: Array<{ id: string; icon: string | null }>,
): Learned {
  const out: Learned = {};
  for (const row of rows) {
    if (row.icon === null) out[row.id] = null;
    else if (isIconId(row.icon)) out[row.id] = row.icon;
  }
  return out;
}
