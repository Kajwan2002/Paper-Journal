import Dexie, { type EntityTable } from "dexie";
import type { Line } from "@/lib/rapidlog";
import type { DayKey } from "@/lib/date";
import { newId } from "@/lib/id";

/** Local-first store. Everything lives on the device; a sync layer
 *  (CRDT + end-to-end encryption) slots in on top of this later. */

export type CoverStyle = "oxblood" | "tan" | "forest" | "black-cloth";
export type PaperStyle = "cream-lined" | "dot-grid" | "blank";

export interface Notebook {
  id: string;
  title: string;
  cover: CoverStyle;
  paper: PaperStyle;
  order: number;
  createdAt: number;
}

export interface Page {
  /** `${notebookId}__${date}` */
  id: string;
  notebookId: string;
  date: DayKey;
  lines: Line[];
  updatedAt: number;
}

/** One line in a week's focus note — free text, no kind, no schedule. Just
 *  what you're keeping an eye on while you plan each day that week. */
export interface FocusLine {
  id: string;
  text: string;
}

export interface WeekNote {
  /** `${notebookId}__${weekStart}` */
  id: string;
  notebookId: string;
  /** the Monday that starts the week */
  weekKey: DayKey;
  lines: FocusLine[];
  updatedAt: number;
}

const db = new Dexie("marginalia") as Dexie & {
  notebooks: EntityTable<Notebook, "id">;
  pages: EntityTable<Page, "id">;
  weekNotes: EntityTable<WeekNote, "id">;
};

db.version(1).stores({
  notebooks: "id, order, createdAt",
  pages: "id, notebookId, date, [notebookId+date], updatedAt",
});

db.version(2).stores({
  notebooks: "id, order, createdAt",
  pages: "id, notebookId, date, [notebookId+date], updatedAt",
  weekNotes: "id, notebookId, weekKey, [notebookId+weekKey], updatedAt",
});

export { db };

export function pageId(notebookId: string, date: DayKey): string {
  return `${notebookId}__${date}`;
}

export function weekNoteId(notebookId: string, weekKey: DayKey): string {
  return `${notebookId}__${weekKey}`;
}

export async function getWeekNote(
  notebookId: string,
  weekKey: DayKey,
): Promise<WeekNote | undefined> {
  return db.weekNotes.get(weekNoteId(notebookId, weekKey));
}

/** Never actually deletes the row, even when you clear every line — a
 *  deleted row has no `updatedAt` for the sync merge to compare against, so
 *  the next pull can't tell "you cleared this on purpose" from "you never
 *  had it," and just puts the old text back from the gist. A document with
 *  an empty `lines` array and a fresh timestamp is the tombstone: it wins
 *  the merge against whatever stale, non-empty copy is still out there. One
 *  small row per week you've ever written a focus point in costs nothing to
 *  keep around. */
export async function saveWeekNote(
  notebookId: string,
  weekKey: DayKey,
  lines: FocusLine[],
): Promise<void> {
  const id = weekNoteId(notebookId, weekKey);
  const keep = lines.filter((l) => l.text.trim().length > 0);
  await db.weekNotes.put({
    id,
    notebookId,
    weekKey,
    lines: keep,
    updatedAt: Date.now(),
  });
}

/** Ensure there is at least one notebook and return the current shelf.
 *
 *  Only the *seeding* is memoised — enough to stop a StrictMode double-mount
 *  creating two "Journal"s — and the shelf itself is re-read every time.
 *  Memoising the whole result meant a renamed, added or imported notebook
 *  was invisible until a reload, and a restore silently bounced the reader
 *  back to the empty notebook first-run had made for them.
 *
 *  The memo is dropped on failure, so a transient IndexedDB error (private
 *  browsing, storage pressure, a blocked upgrade) can be retried instead of
 *  being cached as a permanent blank desk. */
let seeding: Promise<void> | null = null;

export function ensureShelf(): Promise<Notebook[]> {
  if (!seeding) {
    seeding = db
      .transaction("rw", db.notebooks, async () => {
        if ((await db.notebooks.count()) > 0) return;
        await db.notebooks.add({
          id: newId(),
          title: "Journal",
          cover: "oxblood",
          paper: "cream-lined",
          order: 0,
          createdAt: Date.now(),
        });
      })
      .catch((err) => {
        seeding = null;
        throw err;
      });
  }
  return seeding.then(() => db.notebooks.orderBy("order").toArray());
}

export async function updateNotebook(
  id: string,
  patch: Partial<Omit<Notebook, "id">>,
): Promise<void> {
  await db.notebooks.update(id, patch);
}

export async function addNotebook(
  title: string,
  cover: CoverStyle = "oxblood",
  paper: PaperStyle = "cream-lined",
): Promise<Notebook> {
  const order = ((await db.notebooks.orderBy("order").last())?.order ?? -1) + 1;
  const notebook: Notebook = {
    id: newId(),
    title: title.trim() || "Journal",
    cover,
    paper,
    order,
    createdAt: Date.now(),
  };
  await db.notebooks.add(notebook);
  return notebook;
}

export function listNotebooks(): Promise<Notebook[]> {
  return db.notebooks.orderBy("order").toArray();
}

/** Bin a notebook and everything written in it.
 *
 *  Destructive and unrecoverable, so the caller confirms first and the
 *  settings sheet offers an export right beside it. Refuses to remove the
 *  last notebook — an empty shelf has nowhere to land. */
export async function deleteNotebook(id: string): Promise<boolean> {
  return db.transaction(
    "rw",
    db.notebooks,
    db.pages,
    db.weekNotes,
    async () => {
      if ((await db.notebooks.count()) <= 1) return false;
      await db.pages.where("notebookId").equals(id).delete();
      await db.weekNotes.where("notebookId").equals(id).delete();
      await db.notebooks.delete(id);
      return true;
    },
  );
}

export function pageCount(notebookId: string): Promise<number> {
  return db.pages.where("notebookId").equals(notebookId).count();
}

/** Is IndexedDB actually usable here? Private-mode Firefox and some locked
 *  down WebViews expose the API and then reject every transaction. */
export async function probeStorage(): Promise<boolean> {
  try {
    await db.open();
    return true;
  } catch {
    return false;
  }
}

export async function getPage(
  notebookId: string,
  date: DayKey,
): Promise<Page | undefined> {
  return db.pages.get(pageId(notebookId, date));
}

export async function savePage(
  notebookId: string,
  date: DayKey,
  lines: Line[],
): Promise<void> {
  const id = pageId(notebookId, date);
  // a tombstone has no text by design — it must survive the empty-line sweep
  // or the other device would never learn about the deletion
  const keep = lines.filter((l) => l.text.trim().length > 0 || l.deletedAt);
  const written = keep.some((l) => !l.deletedAt);

  if (!written && keep.length === 0) {
    await db.pages.delete(id);
    return;
  }

  await db.pages.put({
    id,
    notebookId,
    date,
    lines: keep,
    updatedAt: Date.now(),
  });
}
