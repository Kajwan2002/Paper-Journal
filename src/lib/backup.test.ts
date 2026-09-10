import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, pageId } from "@/lib/db";
import { buildBackup, importBackup } from "@/lib/backup";
import { newLine } from "@/lib/rapidlog";

const NB = "nb-backup";

async function seed() {
  await db.notebooks.put({
    id: NB,
    title: "Journal",
    cover: "oxblood",
    paper: "cream-lined",
    order: 0,
    createdAt: 1,
  });
  await db.pages.put({
    id: pageId(NB, "2026-09-10"),
    notebookId: NB,
    date: "2026-09-10",
    lines: [newLine("task", "the one line that must survive")],
    updatedAt: 1,
  });
}

beforeEach(async () => {
  await db.pages.clear();
  await db.notebooks.clear();
});

describe("backup", () => {
  it("round-trips a journal through export and import", async () => {
    await seed();
    const json = JSON.stringify(await buildBackup());

    await db.pages.clear();
    await db.notebooks.clear();

    const result = await importBackup(json);
    expect(result.pages).toBe(1);
    expect(result.restored).toEqual([NB]);
    const page = await db.pages.get(pageId(NB, "2026-09-10"));
    expect(page?.lines[0].text).toBe("the one line that must survive");
  });

  it("is a no-op when the same file is imported twice", async () => {
    await seed();
    const json = JSON.stringify(await buildBackup());
    await importBackup(json);
    const again = await importBackup(json);
    expect(again.pages).toBe(0);
    const page = await db.pages.get(pageId(NB, "2026-09-10"));
    expect(page?.lines).toHaveLength(1);
  });

  it("merges rather than replaces a day that already has writing", async () => {
    await seed();
    const json = JSON.stringify(await buildBackup());
    await db.pages.put({
      id: pageId(NB, "2026-09-10"),
      notebookId: NB,
      date: "2026-09-10",
      lines: [newLine("note", "written on the other device")],
      updatedAt: 2,
    });

    await importBackup(json);

    const page = await db.pages.get(pageId(NB, "2026-09-10"));
    expect(page?.lines.map((l) => l.text)).toEqual([
      "written on the other device",
      "the one line that must survive",
    ]);
  });

  it("refuses a file that isn't a Marginalia export", async () => {
    await expect(importBackup("{}")).rejects.toThrow(/Marginalia export/);
    await expect(importBackup("not json")).rejects.toThrow(/isn't JSON/);
  });

  it("refuses an export from a newer version", async () => {
    await seed();
    const backup = await buildBackup();
    await expect(
      importBackup(JSON.stringify({ ...backup, format: 99 })),
    ).rejects.toThrow(/newer version/);
  });
});
