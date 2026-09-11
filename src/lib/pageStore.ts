import { getPage, pageId, savePage } from "@/lib/db";
import type { Line } from "@/lib/rapidlog";
import { living, stampEdits, withTombstones } from "@/lib/merge";
import type { DayKey } from "@/lib/date";

/** A tiny in-memory cache over the Dexie page records so that flipping
 *  between days is instant and never flashes an empty page. Writes are
 *  debounced per page. This is the seam the sync layer plugs into later. */

const cache = new Map<string, Line[]>();
const listeners = new Map<string, Set<() => void>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const inflight = new Map<string, Promise<void>>();
const meta = new Map<string, { notebookId: string; date: DayKey }>();
const revisions = new Map<string, number>();
/** tombstones for each page, held apart from the living lines the UI sees */
const buried = new Map<string, Line[]>();

const journalListeners = new Set<() => void>();

function emit(key: string): void {
  listeners.get(key)?.forEach((fn) => fn());
  journalListeners.forEach((fn) => fn());
}

/** Fires on any change to any page. The open-loops ribbon uses it so its
 *  count stays honest the moment something is ticked off, rather than going
 *  stale until an overlay happens to close. */
export function subscribeJournal(fn: () => void): () => void {
  journalListeners.add(fn);
  return () => {
    journalListeners.delete(fn);
  };
}

/** Tell everything watching the journal that something changed, for a write
 *  that doesn't go through a page's own cache — a week's focus note, say. */
export function notifyJournal(): void {
  journalListeners.forEach((fn) => fn());
}

/** Forget everything cached and re-read from storage.
 *
 *  A sync pull writes merged pages straight to Dexie; without this the app
 *  would keep showing the pre-merge version it already had in memory. Any
 *  page still holding an unwritten edit is flushed first, so this can never
 *  be the thing that loses a sentence. */
export async function reprime(): Promise<void> {
  await flushAsync();
  const keys = [...cache.keys()];
  cache.clear();
  buried.clear();
  await Promise.all(
    keys.map((key) => {
      const m = meta.get(key);
      return m ? prime(m.notebookId, m.date) : Promise.resolve();
    }),
  );
  for (const key of keys) emit(key);
}

/** The tombstones a page is carrying, for the sync layer to ship. */
export function graveyard(key: string): Line[] {
  return buried.get(key) ?? [];
}

/** Bumped on every local edit. Rollover captures these before its awaits and
 *  re-checks them afterwards, so a sentence typed *while* it is rewriting
 *  pages can never be silently overwritten. */
export function revision(key: string): number {
  return revisions.get(key) ?? 0;
}

export function subscribe(key: string, fn: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(fn);
  return () => {
    set?.delete(fn);
  };
}

export function getCached(key: string): Line[] | undefined {
  return cache.get(key);
}

export function prime(notebookId: string, date: DayKey): Promise<void> {
  const key = pageId(notebookId, date);
  meta.set(key, { notebookId, date });
  if (cache.has(key)) return Promise.resolve();
  const existing = inflight.get(key);
  if (existing) return existing;

  const job = getPage(notebookId, date).then((p) => {
    if (!cache.has(key)) {
      // storage keeps tombstones so the other device learns about deletions;
      // the cache the UI reads holds only living lines
      cache.set(key, living(p?.lines ?? []));
      buried.set(
        key,
        (p?.lines ?? []).filter((l) => l.deletedAt),
      );
      emit(key);
    }
    inflight.delete(key);
  });
  inflight.set(key, job);
  return job;
}

export function writeLines(
  notebookId: string,
  date: DayKey,
  lines: Line[],
): void {
  const key = pageId(notebookId, date);
  meta.set(key, { notebookId, date });

  // stamp what actually changed, and record what disappeared, so two
  // devices can be merged later without guessing which edit came first
  const previous = cache.get(key) ?? [];
  const stamped = stampEdits(lines, previous);
  const withGraves = withTombstones(stamped, previous);
  const graves = [
    ...(buried.get(key) ?? []),
    ...withGraves.filter((l) => l.deletedAt),
  ];

  cache.set(key, stamped);
  buried.set(key, graves);
  revisions.set(key, revision(key) + 1);
  emit(key);

  const t = timers.get(key);
  if (t) clearTimeout(t);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      void savePage(notebookId, date, [...stamped, ...graves]);
    }, 500),
  );
}

/** Write every pending debounced page immediately. Safe to call any time. */
export function flush(): void {
  void flushAsync();
}

/** `flush`, but you can wait for the writes to land. Anything that reads
 *  Dexie directly — search, export — must await this first, or it reads a
 *  journal that is up to half a second out of date. */
export function flushAsync(): Promise<void> {
  const writes: Array<Promise<void>> = [];
  for (const [key, t] of timers) {
    clearTimeout(t);
    const m = meta.get(key);
    const lines = cache.get(key);
    if (m && lines) {
      writes.push(
        savePage(m.notebookId, m.date, [...lines, ...(buried.get(key) ?? [])]),
      );
    }
  }
  timers.clear();
  return Promise.all(writes).then(() => undefined);
}

/** True while any page has an unwritten edit. */
export function hasPendingWrites(): boolean {
  return timers.size > 0;
}

/** Replace the cached lines for a day that has *already been persisted*
 *  elsewhere (e.g. by rollover's own transaction). Cancels any pending
 *  debounce for that key and notifies subscribers once. */
export function adopt(notebookId: string, date: DayKey, lines: Line[]): void {
  const key = pageId(notebookId, date);
  meta.set(key, { notebookId, date });
  buried.set(key, [
    ...(buried.get(key) ?? []),
    ...lines.filter((l) => l.deletedAt),
  ]);
  lines = living(lines);
  const t = timers.get(key);
  if (t) {
    clearTimeout(t);
    timers.delete(key);
  }
  cache.set(key, lines);
  emit(key);
}

/** Like `adopt`, but also persists straight away (no debounce). Used for the
 *  page a rollover merges carried tasks onto. */
export function commitRollover(
  notebookId: string,
  date: DayKey,
  lines: Line[],
): void {
  adopt(notebookId, date, lines);
  void savePage(notebookId, date, lines);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flush();
  });
  // iOS Safari fires pagehide instead of a reliable visibilitychange
  window.addEventListener("pagehide", flush);
}
