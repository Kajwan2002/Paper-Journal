import { getPage, pageId, savePage } from "@/lib/db";
import type { Line } from "@/lib/rapidlog";
import type { DayKey } from "@/lib/date";

/** A tiny in-memory cache over the Dexie page records so that flipping
 *  between days is instant and never flashes an empty page. Writes are
 *  debounced per page. This is the seam the sync layer plugs into later. */

const cache = new Map<string, Line[]>();
const listeners = new Map<string, Set<() => void>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const inflight = new Map<string, Promise<void>>();

function emit(key: string): void {
  listeners.get(key)?.forEach((fn) => fn());
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
  if (cache.has(key)) return Promise.resolve();
  const existing = inflight.get(key);
  if (existing) return existing;

  const job = getPage(notebookId, date).then((p) => {
    if (!cache.has(key)) {
      cache.set(key, p?.lines ?? []);
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
  cache.set(key, lines);
  emit(key);

  const t = timers.get(key);
  if (t) clearTimeout(t);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      void savePage(notebookId, date, lines);
    }, 500),
  );
}
