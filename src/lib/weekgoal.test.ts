import "fake-indexeddb/auto";
import { describe, expect, it, beforeEach } from "vitest";

const { db, saveWeekNote, getWeekNote } = await import("@/lib/db");
const { loadGoal, saveGoal, loadFocusLines, saveFocusLines, newFocusLine } =
  await import("@/lib/focus");

const NB = "nb";
const MON = "2026-11-09";
const WED = "2026-11-11";

beforeEach(async () => {
  await db.weekNotes.clear();
});

describe("this week's goal", () => {
  it("is written once and read back from any day of that week", async () => {
    await saveGoal(NB, MON, { text: "Finish the game" });
    expect((await loadGoal(NB, WED)).text).toBe("Finish the game");
  });

  it("is crossed out without losing what it says", async () => {
    await saveGoal(NB, MON, { text: "Finish the game" });
    await saveGoal(NB, WED, { text: "Finish the game", struck: true });
    const got = await loadGoal(NB, MON);
    expect(got).toEqual({ text: "Finish the game", struck: true });
  });

  it("does not carry into the next week", async () => {
    await saveGoal(NB, MON, { text: "Finish the game" });
    expect((await loadGoal(NB, "2026-11-16")).text).toBe("");
  });

  it("keeps the focus lines when the goal is written", async () => {
    // the two are edited apart, and saving one as a whole row would wipe
    // the other — then the wipe would win the next merge on its timestamp
    await saveFocusLines(NB, MON, [newFocusLine("Gym x3")]);
    await saveGoal(NB, MON, { text: "Finish the game" });
    const lines = await loadFocusLines(NB, MON);
    expect(lines.map((l) => l.text)).toEqual(["Gym x3"]);
    expect((await loadGoal(NB, MON)).text).toBe("Finish the game");
  });

  it("keeps the goal when the focus lines are written", async () => {
    await saveGoal(NB, MON, { text: "Finish the game" });
    await saveFocusLines(NB, MON, [newFocusLine("Gym x3")]);
    expect((await loadGoal(NB, MON)).text).toBe("Finish the game");
  });

  it("clearing it keeps the row, so the other device learns it is gone", async () => {
    await saveGoal(NB, MON, { text: "Finish the game" });
    await saveGoal(NB, MON, { text: "   " });
    expect((await loadGoal(NB, MON)).text).toBe("");
    // a deleted row has nothing for the merge to compare against, and the
    // old goal would come straight back
    expect(await getWeekNote(NB, MON)).toBeDefined();
  });

  it("is untouched by a week note written without one", async () => {
    await saveGoal(NB, MON, { text: "Finish the game", struck: true });
    await saveWeekNote(NB, MON, { lines: [newFocusLine("Study x5")] });
    expect(await loadGoal(NB, MON)).toEqual({
      text: "Finish the game",
      struck: true,
    });
  });
});
