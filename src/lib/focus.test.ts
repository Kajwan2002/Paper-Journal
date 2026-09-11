import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, pageId } from "@/lib/db";
import { adopt } from "@/lib/pageStore";
import { newLine } from "@/lib/rapidlog";
import { addDays } from "@/lib/date";
import {
  focusRows,
  loadFocusLines,
  newFocusLine,
  saveFocusLines,
} from "@/lib/focus";

const NB = "nb-focus";
const MON = "2026-09-07"; // a Monday
const THU = "2026-09-10"; // same week

async function put(date: string, lines: ReturnType<typeof newLine>[]) {
  await db.pages.put({
    id: pageId(NB, date),
    notebookId: NB,
    date,
    lines,
    updatedAt: Date.now(),
  });
  adopt(NB, date, lines);
}

beforeEach(async () => {
  await db.pages.clear();
  await db.weekNotes.clear();
  // pageStore keeps its own in-memory cache, which `db.pages.clear()` above
  // never touches — reset every day a test in this file writes to, or a
  // struck line adopted in one test leaks into the next one's tally
  for (let i = -2; i <= 8; i++) adopt(NB, addDays(MON, i), []);
});

describe("saveFocusLines / loadFocusLines", () => {
  it("round-trips and drops blank lines", async () => {
    await saveFocusLines(NB, MON, [
      newFocusLine("Gym x3"),
      newFocusLine("   "),
      newFocusLine("Exam Thursday"),
    ]);
    const got = await loadFocusLines(NB, THU);
    expect(got.map((l) => l.text)).toEqual(["Gym x3", "Exam Thursday"]);
  });

  it("is shared by every day in the same week", async () => {
    await saveFocusLines(NB, MON, [newFocusLine("Exam Thursday")]);
    expect((await loadFocusLines(NB, THU))[0].text).toBe("Exam Thursday");
  });

  it("is empty for a week nothing was written in", async () => {
    expect(await loadFocusLines(NB, MON)).toEqual([]);
  });

  it("keeps the week's row when you clear every line, instead of deleting it", async () => {
    // regression: deleting the row on save meant the next sync pull saw
    // "nothing here" and put the old text right back from the gist, since a
    // missing row can't be told apart from one that was never received
    await saveFocusLines(NB, MON, [newFocusLine("Gym x3")]);
    const written = await db.weekNotes.get(`${NB}__${MON}`);
    expect(written?.lines).toHaveLength(1);

    await saveFocusLines(NB, MON, [newFocusLine("")]);
    const cleared = await db.weekNotes.get(`${NB}__${MON}`);

    expect(cleared).toBeDefined();
    expect(cleared?.lines).toEqual([]);
    // stamped no earlier than the version with real text on it — that's
    // what lets it win a sync merge against the old, still-pending gist copy
    expect(cleared!.updatedAt).toBeGreaterThanOrEqual(written!.updatedAt);
    expect(await loadFocusLines(NB, THU)).toEqual([]);
  });
});

describe("focusRows", () => {
  it("tallies a target against what got finished that week, case-insensitively", async () => {
    await saveFocusLines(NB, MON, [newFocusLine("Gym x3")]);
    await put(MON, [{ ...newLine("task", "Gym"), struck: true }]);
    await put(addDays(MON, 2), [
      { ...newLine("task", "hit the GYM"), struck: true },
    ]);
    await put(addDays(MON, 4), [newLine("task", "Gym")]); // not struck — doesn't count

    const rows = await focusRows(NB, THU);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("Gym");
    expect(rows[0].target).toBe(3);
    expect(rows[0].count).toBe(2);
  });

  it("still shows a count with no explicit target", async () => {
    await saveFocusLines(NB, MON, [newFocusLine("Call the landlord")]);
    await put(MON, [
      { ...newLine("task", "Call the landlord back"), struck: true },
    ]);

    const rows = await focusRows(NB, THU);
    expect(rows[0].target).toBeUndefined();
    expect(rows[0].count).toBe(1);
  });

  it("never counts against a different week", async () => {
    await saveFocusLines(NB, MON, [newFocusLine("Gym x3")]);
    await put(addDays(MON, -1), [{ ...newLine("task", "Gym"), struck: true }]);
    await put(addDays(MON, 7), [{ ...newLine("task", "Gym"), struck: true }]);

    expect((await focusRows(NB, THU))[0].count).toBe(0);
  });

  it("is empty when nothing was written for the week", async () => {
    expect(await focusRows(NB, THU)).toEqual([]);
  });

  it("doesn't match on noise words alone", async () => {
    await saveFocusLines(NB, MON, [newFocusLine("Focus for the week")]);
    await put(MON, [{ ...newLine("task", "Water the plants"), struck: true }]);

    expect((await focusRows(NB, THU))[0].count).toBe(0);
  });
});
