import { db, type Notebook, type Page } from "@/lib/db";
import { flushAsync, subscribeJournal } from "@/lib/pageStore";
import { mergeLines } from "@/lib/merge";
import { decrypt, encrypt, importKey } from "@/lib/crypto";
import { readGist, writeGist, type GistRef } from "@/lib/gist";
import { useSync, type SyncConfig } from "@/state/sync";
import { BACKUP_FORMAT, type Backup } from "@/lib/backup";

/** The sync loop.
 *
 *  Pull, merge, push — in that order, every time, so the copy that goes up
 *  already contains whatever the other device had. There is no server
 *  arbitrating, so both devices converge by the merge rules rather than by
 *  who spoke last.
 *
 *  Deliberately unhurried: this is a journal, not a chat. It syncs when the
 *  app opens, a few seconds after you stop typing, when you switch away, and
 *  on a slow poll while it is open. */

const IDLE_PUSH_MS = 4000;
const POLL_MS = 90_000;

let running: Promise<void> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let stopWatching: (() => void) | null = null;

function refOf(config: SyncConfig): GistRef {
  return { id: config.gistId, token: config.token };
}

async function localSnapshot(): Promise<Backup> {
  await flushAsync();
  const [notebooks, pages] = await Promise.all([
    db.notebooks.orderBy("order").toArray(),
    db.pages.toArray(),
  ]);
  return {
    format: BACKUP_FORMAT,
    app: "marginalia",
    exportedAt: new Date().toISOString(),
    notebooks,
    pages,
  };
}

/** Fold a remote snapshot into local storage, line by line. Returns true if
 *  anything here actually changed, so the caller knows to refresh the UI. */
async function absorb(remote: Backup): Promise<boolean> {
  let changed = false;

  // a remote written by an older or half-finished version may be missing
  // either list; treat that as "nothing to bring over" rather than throwing
  const remoteNotebooks: Notebook[] = Array.isArray(remote.notebooks)
    ? remote.notebooks
    : [];
  const remotePages: Page[] = Array.isArray(remote.pages) ? remote.pages : [];

  await db.transaction("rw", db.notebooks, db.pages, async () => {
    for (const notebook of remoteNotebooks) {
      const mine = await db.notebooks.get(notebook.id);
      if (!mine) {
        await db.notebooks.add(notebook);
        changed = true;
      } else if ((notebook.createdAt ?? 0) > (mine.createdAt ?? 0)) {
        await db.notebooks.put(notebook);
        changed = true;
      }
    }

    for (const page of remotePages) {
      if (!page?.id || !Array.isArray(page.lines)) continue;
      const mine = await db.pages.get(page.id);
      if (!mine) {
        await db.pages.put(page);
        changed = true;
        continue;
      }
      const merged = mergeLines(mine.lines, page.lines);
      if (JSON.stringify(merged) === JSON.stringify(mine.lines)) continue;
      await db.pages.put({
        ...mine,
        lines: merged,
        updatedAt: Math.max(mine.updatedAt, page.updatedAt),
      });
      changed = true;
    }
  });

  return changed;
}

/** Every device seeds itself a "Journal" on first run, before it has any
 *  idea another one exists — so pairing unions two empty-ish notebooks and
 *  each device carries on showing its own. Pick the one that actually has
 *  writing in it, and bin an untouched seed rather than leaving a confusing
 *  second notebook on the shelf. Nothing with a page in it is ever removed. */
async function reconcileNotebooks(
  currentId: string | null,
): Promise<string | null> {
  const notebooks = await db.notebooks.orderBy("order").toArray();
  if (notebooks.length < 2) return null;

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
  if (written.length > 0) {
    for (const nb of notebooks) {
      if ((counts.get(nb.id) ?? 0) > 0) continue;
      if (nb.id === (adopt ?? currentId)) continue;
      await db.notebooks.delete(nb.id);
    }
  }

  return adopt;
}

/** One full pass. Safe to call whenever; overlapping calls share the run. */
export function syncNow(): Promise<void> {
  if (running) return running;
  const { config, setPhase, setSynced } = useSync.getState();
  if (!config) return Promise.resolve();

  running = (async () => {
    setPhase("working");
    try {
      const key = await importKey(config.key);
      const ref = refOf(config);

      // pull
      const { content } = await readGist(ref);
      let pulledChanged = false;
      if (content && content.trim()) {
        let remote: Backup;
        try {
          remote = JSON.parse(await decrypt(key, content.trim())) as Backup;
        } catch {
          throw new Error(
            "Couldn't read the synced journal — the sync code doesn't match this gist.",
          );
        }
        if (remote?.app === "marginalia") {
          pulledChanged = await absorb(remote);
        }
      }

      // push the merged result back
      const mine = await localSnapshot();
      await writeGist(ref, await encrypt(key, JSON.stringify(mine)));

      setSynced(Date.now());
      if (pulledChanged) {
        const adopt = await reconcileNotebooks(
          useSync.getState().currentNotebookId,
        );
        window.dispatchEvent(
          new CustomEvent("marginalia:pulled", { detail: { adopt } }),
        );
      }
    } catch (err) {
      setPhase("error", explain(err));
    } finally {
      running = null;
    }
  })();

  return running;
}

/** A dropped connection is the ordinary case, not a fault — say so in words
 *  rather than handing over the browser's own "Failed to fetch". */
function explain(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  if (!navigator.onLine || /fetch|network|load failed/i.test(message)) {
    return "Offline — it'll sync when you're back.";
  }
  return message || "Sync failed.";
}

function nudge(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => void syncNow(), IDLE_PUSH_MS);
}

/** Start syncing in the background. Idempotent. */
export function startSync(): void {
  stopSync();
  if (!useSync.getState().config) return;

  stopWatching = subscribeJournal(nudge);
  pollTimer = setInterval(() => {
    if (!document.hidden) void syncNow();
  }, POLL_MS);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onLeave);
  window.addEventListener("online", onLeave);
  void syncNow();
}

export function stopSync(): void {
  stopWatching?.();
  stopWatching = null;
  if (idleTimer) clearTimeout(idleTimer);
  if (pollTimer) clearInterval(pollTimer);
  idleTimer = pollTimer = null;
  document.removeEventListener("visibilitychange", onVisibility);
  window.removeEventListener("pagehide", onLeave);
  window.removeEventListener("online", onLeave);
}

function onVisibility(): void {
  if (!document.hidden) void syncNow();
  else void syncNow();
}

function onLeave(): void {
  void syncNow();
}
