import { db, type Notebook, type Page, type WeekNote } from "@/lib/db";
import { flushAsync } from "@/lib/pageStore";
import { glyphFor, isStruck, type Line } from "@/lib/rapidlog";
import { longDate, todayKey } from "@/lib/date";

/** Tear out a copy.
 *
 *  Everything lives in IndexedDB, which the browser is entitled to delete.
 *  Until sync exists, an export you can put in a folder is the only thing
 *  standing between a year of journalling and a cleared cache — so it is a
 *  first-class feature, not a debug hatch. JSON round-trips exactly;
 *  Markdown is for reading somewhere else. */

export const BACKUP_FORMAT = 1;

export interface Backup {
  format: number;
  app: "marginalia";
  exportedAt: string;
  notebooks: Notebook[];
  pages: Page[];
  /** absent in a backup taken before weekly focus notes existed */
  weekNotes?: WeekNote[];
}

export async function buildBackup(): Promise<Backup> {
  await flushAsync(); // never export a journal missing the last line typed
  const [notebooks, pages, weekNotes] = await Promise.all([
    db.notebooks.orderBy("order").toArray(),
    db.pages.toArray(),
    db.weekNotes.toArray(),
  ]);
  pages.sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    format: BACKUP_FORMAT,
    app: "marginalia",
    exportedAt: new Date().toISOString(),
    notebooks,
    pages,
    weekNotes,
  };
}

export async function exportJson(): Promise<Blob> {
  const backup = await buildBackup();
  return new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
}

function lineToMarkdown(line: Line): string {
  const indent = line.indent === 1 ? "  " : "";
  const body = isStruck(line) ? `~~${line.text}~~` : line.text;
  const tail = [
    line.due ? `(due ${line.due})` : "",
    line.someday ? "(someday)" : "",
    line.carriedTo ? `→ ${line.carriedTo}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `${indent}${glyphFor(line)} ${body}${tail ? ` ${tail}` : ""}`.trimEnd();
}

export async function exportMarkdown(): Promise<Blob> {
  const backup = await buildBackup();
  const byId = new Map(backup.notebooks.map((n) => [n.id, n]));
  const out: string[] = [];

  for (const notebook of backup.notebooks) {
    out.push(`# ${notebook.title}`, "");
    const pages = backup.pages.filter((p) => p.notebookId === notebook.id);
    for (const page of pages) {
      const written = page.lines.filter((l) => l.text.trim().length > 0);
      if (written.length === 0) continue;
      out.push(`## ${longDate(page.date)}`, "");
      for (const line of written) out.push(lineToMarkdown(line));
      out.push("");
    }
  }

  // any orphaned pages, so an export can never quietly drop writing
  const orphans = backup.pages.filter((p) => !byId.has(p.notebookId));
  if (orphans.length > 0) {
    out.push("# Unfiled", "");
    for (const page of orphans) {
      out.push(`## ${longDate(page.date)}`, "");
      for (const line of page.lines) out.push(lineToMarkdown(line));
      out.push("");
    }
  }

  return new Blob([out.join("\n")], { type: "text/markdown" });
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // revoke late — Safari needs the object alive past the click
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function backupFilename(ext: "json" | "md"): string {
  return `marginalia-${todayKey()}.${ext}`;
}

export interface ImportResult {
  notebooks: number;
  pages: number;
  skipped: number;
  /** notebooks the import actually put pages into, so the app can land the
   *  reader on their restored journal rather than the empty one it made
   *  for them on first run */
  restored: string[];
}

function isBackup(value: unknown): value is Backup {
  if (typeof value !== "object" || value === null) return false;
  const b = value as Partial<Backup>;
  return (
    b.app === "marginalia" &&
    Array.isArray(b.notebooks) &&
    Array.isArray(b.pages)
  );
}

/** Merge a backup into the current journal.
 *
 *  Pages are merged per day rather than replaced: lines already present (by
 *  id) are left alone and anything new is appended. Importing the same file
 *  twice is therefore a no-op, and importing a phone's export onto a laptop
 *  unions the two — which is the honest thing to do until real sync lands. */
export async function importBackup(text: string): Promise<ImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file isn't JSON.");
  }
  if (!isBackup(parsed)) {
    throw new Error("That doesn't look like a Marginalia export.");
  }
  if (parsed.format > BACKUP_FORMAT) {
    throw new Error("That export came from a newer version of Marginalia.");
  }

  let pagesTouched = 0;
  let skipped = 0;
  const restored = new Set<string>();

  await db.transaction("rw", db.notebooks, db.pages, db.weekNotes, async () => {
    for (const notebook of parsed.notebooks) {
      const existing = await db.notebooks.get(notebook.id);
      if (!existing) await db.notebooks.add(notebook);
    }

    for (const page of parsed.pages) {
      if (!page?.id || !Array.isArray(page.lines)) {
        skipped++;
        continue;
      }
      restored.add(page.notebookId);
      const existing = await db.pages.get(page.id);
      if (!existing) {
        await db.pages.put({ ...page, updatedAt: Date.now() });
        pagesTouched++;
        continue;
      }
      const seen = new Set(existing.lines.map((l) => l.id));
      const added = page.lines.filter((l) => !seen.has(l.id));
      if (added.length === 0) continue;
      await db.pages.put({
        ...existing,
        lines: [...existing.lines, ...added],
        updatedAt: Date.now(),
      });
      pagesTouched++;
    }

    // a week note has no per-line ids worth reconciling — keep whichever
    // side has one already rather than trying to merge free text
    for (const note of parsed.weekNotes ?? []) {
      if (!note?.id || !Array.isArray(note.lines)) continue;
      const existing = await db.weekNotes.get(note.id);
      if (!existing) await db.weekNotes.put(note);
    }
  });

  return {
    notebooks: parsed.notebooks.length,
    pages: pagesTouched,
    skipped,
    restored: [...restored],
  };
}
