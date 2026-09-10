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

const db = new Dexie("marginalia") as Dexie & {
  notebooks: EntityTable<Notebook, "id">;
  pages: EntityTable<Page, "id">;
};

db.version(1).stores({
  notebooks: "id, order, createdAt",
  pages: "id, notebookId, date, [notebookId+date], updatedAt",
});

export { db };

export function pageId(notebookId: string, date: DayKey): string {
  return `${notebookId}__${date}`;
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
  return db.transaction("rw", db.notebooks, db.pages, async () => {
    if ((await db.notebooks.count()) <= 1) return false;
    await db.pages.where("notebookId").equals(id).delete();
    await db.notebooks.delete(id);
    return true;
  });
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
  const nonEmpty = lines.filter((l) => l.text.trim().length > 0);

  if (nonEmpty.length === 0) {
    await db.pages.delete(id);
    return;
  }

  await db.pages.put({
    id,
    notebookId,
    date,
    lines: nonEmpty,
    updatedAt: Date.now(),
  });
}
