import { db, type ThingPref } from "@/lib/db";
import { notifyJournal } from "@/lib/pageStore";
import type { ThingPrefs } from "@/lib/month";

/** What you have told the month page about the things on it.
 *
 *  All of it is keyed by the word rather than by the row, because a row is
 *  a thing of the moment — "clean the kitchen" is one row this month and
 *  two words next month if you write them apart. A removal has to hold
 *  across that, and a word is the only part that doesn't move. */

async function set(word: string, patch: Partial<ThingPref>): Promise<void> {
  const id = word.trim().toLowerCase();
  if (!id) return;
  const held = await db.thingPrefs.get(id);
  await db.thingPrefs.put({
    ...held,
    ...patch,
    id,
    updatedAt: Date.now(),
  });
  // written straight to storage, behind the page cache's back, so nothing
  // else would know to send it to the other device
  notifyJournal();
}

/** Gone, in this month and every other, until it is added back.
 *
 *  Each word remembers the others it was removed alongside, so putting
 *  "add excel" back brings back "add excel" and not a lone "add". */
export async function hideThing(words: string[]): Promise<void> {
  for (const word of words) {
    await set(word, { hidden: true, tracked: false, with: words });
  }
}

/** Back, and kept in view even in a month it barely comes up. */
export async function trackThing(...words: string[]): Promise<void> {
  for (const word of words) {
    await set(word, { hidden: false, tracked: true, with: undefined });
  }
}

/** Call it something else. An empty name puts the word back. */
export async function renameThing(
  words: string[],
  label: string,
): Promise<void> {
  const name = label.trim();
  for (const word of words) {
    await set(word, { label: name || undefined });
  }
}

export async function loadPrefs(): Promise<ThingPrefs> {
  return asPrefs(await db.thingPrefs.toArray());
}

export function asPrefs(rows: ThingPref[]): ThingPrefs {
  const out: ThingPrefs = {};
  for (const row of rows) {
    out[row.id] = {
      hidden: row.hidden,
      tracked: row.tracked,
      label: row.label,
      with: row.with,
    };
  }
  return out;
}

/** What you have removed, as the rows you removed — for putting one back
 *  without having to remember exactly how you spelt it. */
export function hiddenThings(prefs: ThingPrefs): string[][] {
  const groups = new Map<string, string[]>();
  for (const [word, pref] of Object.entries(prefs)) {
    if (!pref?.hidden) continue;
    // a row removed before `with` existed is its own group of one
    const words = (pref.with?.length ? pref.with : [word]).filter(
      (w) => prefs[w]?.hidden,
    );
    groups.set([...words].sort().join(" "), words);
  }
  return [...groups.values()].sort((a, b) =>
    a.join(" ").localeCompare(b.join(" ")),
  );
}
