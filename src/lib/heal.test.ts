import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, pageId } from "@/lib/db";
import { flushAsync } from "@/lib/pageStore";
import { healDoubles } from "@/lib/heal";
import { newLine } from "@/lib/rapidlog";
import { addDays, todayKey } from "@/lib/date";

/** a notebook of its own per test: the page cache lives for the module,
 *  so sharing an id would let one test's writes answer the next one */
let n = 0;
let NB = "nb-heal-0";
const T0 = todayKey();
const YDAY = addDays(T0, -1);
/** read back from storage, not the cache: that is where both devices and
 *  the next launch actually look */
const on = async (d: string) =>
  (await db.pages.get(pageId(NB, d)))?.lines ?? [];
const live = async (d: string) =>
  (await on(d)).filter((l) => !l.deletedAt && l.text.trim()).map((l) => l.text);

/** a page written straight to storage, the way a sync pull writes one */
async function put(date: string, lines: unknown[]): Promise<void> {
  await db.pages.put({
    id: pageId(NB, date),
    notebookId: NB,
    date,
    lines: lines as never,
    updatedAt: Date.now(),
  });
}

beforeEach(async () => {
  await db.pages.clear();
  NB = `nb-heal-${++n}`;
});

describe("one live copy of a line, in the whole journal", () => {
  it("keeps the copy that was touched last and buries the other", async () => {
    // what a half-landed move leaves behind: the line arrived on its new
    // page and the tombstone never reached the old one
    const id = "x1";
    await put(YDAY, [
      { id, kind: "event", text: "Dentist", indent: 0, editedAt: 500 },
    ]);
    await put(T0, [
      { id, kind: "event", text: "Dentist", indent: 0, editedAt: 100 },
    ]);

    const healed = await healDoubles(NB);
    await flushAsync();

    expect(healed.ids).toEqual([id]);
    expect(await live(YDAY)).toEqual(["Dentist"]);
    expect(await live(T0)).toEqual([]);
  });

  it("leaves a tombstone, so the other device agrees instead of putting it back", async () => {
    const id = "x2";
    await put(YDAY, [
      { id, kind: "task", text: "Ring the dentist", indent: 0, editedAt: 9 },
    ]);
    await put(T0, [
      { id, kind: "task", text: "Ring the dentist", indent: 0, editedAt: 7 },
    ]);

    await healDoubles(NB);
    await flushAsync();

    const stored = await db.pages.get(pageId(NB, T0));
    const buried = stored?.lines.find((l) => l.id === id);
    expect(buried?.deletedAt).toBeDefined();
    expect(buried?.text).toBe("");
  });

  it("does not touch a rollover breadcrumb, which is meant to be there", async () => {
    // the `›` on the day a task was carried from shares its id on purpose
    const id = "x3";
    await put(YDAY, [
      {
        id,
        kind: "migrated",
        text: "Seminararbeit",
        indent: 0,
        carriedTo: T0,
        editedAt: 50,
      },
    ]);
    await put(T0, [
      { id, kind: "task", text: "Seminararbeit", indent: 0, editedAt: 10 },
    ]);

    const healed = await healDoubles(NB);
    await flushAsync();

    expect(healed.ids).toEqual([]);
    expect(await live(T0)).toEqual(["Seminararbeit"]);
    expect((await on(YDAY))[0].carriedTo).toBe(T0);
  });

  it("leaves a sound journal exactly as it is, and runs twice to the same end", async () => {
    await put(YDAY, [newLine("note", "quiet day") as never]);
    await put(T0, [newLine("task", "Gym") as never]);

    expect((await healDoubles(NB)).ids).toEqual([]);
    expect((await healDoubles(NB)).ids).toEqual([]);
    await flushAsync();
    expect(await live(YDAY)).toEqual(["quiet day"]);
    expect(await live(T0)).toEqual(["Gym"]);
  });

  it("settles a line that is doubled on one page, not only across two", async () => {
    const id = "x4";
    await put(T0, [
      { id, kind: "event", text: "Praktikum", indent: 0, editedAt: 4 },
      { id, kind: "event", text: "Praktikum", indent: 0, editedAt: 9 },
    ]);

    await healDoubles(NB);
    await flushAsync();

    expect(await live(T0)).toEqual(["Praktikum"]);
  });
});
