import "fake-indexeddb/auto";
import { describe, expect, it, beforeEach } from "vitest";

const { db, saveWeekNote, getWeekNote, weekNoteId } = await import("@/lib/db");
const {
  loadGoals,
  saveGoals,
  newGoal,
  loadFocusLines,
  saveFocusLines,
  newFocusLine,
} = await import("@/lib/focus");

const NB = "nb";
const MON = "2026-11-09";
const WED = "2026-11-11";

const texts = async (date = MON) =>
  (await loadGoals(NB, date)).map((g) => g.text);

beforeEach(async () => {
  await db.weekNotes.clear();
});

describe("this week's goals", () => {
  it("are written once and read back from any day of that week", async () => {
    await saveGoals(NB, MON, [newGoal("Finish the game"), newGoal("Call dad")]);
    expect(await texts(WED)).toEqual(["Finish the game", "Call dad"]);
  });

  it("are crossed out one at a time, without losing what they say", async () => {
    const [a, b] = [newGoal("Finish the game"), newGoal("Call dad")];
    await saveGoals(NB, MON, [a, b]);
    await saveGoals(NB, WED, [{ ...a, struck: true }, b]);
    const got = await loadGoals(NB, MON);
    expect(got.map((g) => [g.text, g.struck === true])).toEqual([
      ["Finish the game", true],
      ["Call dad", false],
    ]);
  });

  it("do not carry into the next week", async () => {
    await saveGoals(NB, MON, [newGoal("Finish the game")]);
    expect(await texts("2026-11-16")).toEqual([]);
  });

  it("never store a blank one, however many you typed into", async () => {
    await saveGoals(NB, MON, [
      newGoal("Finish the game"),
      newGoal("   "),
      newGoal(""),
    ]);
    expect(await texts()).toEqual(["Finish the game"]);
  });

  it("keep the focus lines when a goal is written", async () => {
    // the two are edited in different places, and saving one as a whole
    // row would wipe the other — then the wipe would win the next merge
    await saveFocusLines(NB, MON, [newFocusLine("Gym x3")]);
    await saveGoals(NB, MON, [newGoal("Finish the game")]);
    expect((await loadFocusLines(NB, MON)).map((l) => l.text)).toEqual([
      "Gym x3",
    ]);
    expect(await texts()).toEqual(["Finish the game"]);
  });

  it("survive the focus lines being written", async () => {
    await saveGoals(NB, MON, [newGoal("Finish the game")]);
    await saveFocusLines(NB, MON, [newFocusLine("Gym x3")]);
    expect(await texts()).toEqual(["Finish the game"]);
  });

  it("clearing them keeps the row, so the other device learns they are gone", async () => {
    await saveGoals(NB, MON, [newGoal("Finish the game")]);
    await saveGoals(NB, MON, []);
    expect(await texts()).toEqual([]);
    // a deleted row has nothing for the merge to compare against, and the
    // old goal would come straight back
    expect(await getWeekNote(NB, MON)).toBeDefined();
  });

  it("are untouched by a week note written without them", async () => {
    await saveGoals(NB, MON, [newGoal("Finish the game")]);
    await saveWeekNote(NB, MON, { lines: [newFocusLine("Study x5")] });
    expect(await texts()).toEqual(["Finish the game"]);
  });

  it("read back a week that was written when there was only one goal", async () => {
    // the shape this shipped as, still sitting in storage and on other
    // devices — it should turn up in the list, not vanish
    await db.weekNotes.put({
      id: weekNoteId(NB, MON),
      notebookId: NB,
      weekKey: MON,
      lines: [],
      goal: { text: "Finish the game", struck: true },
      updatedAt: 1,
    });
    const got = await loadGoals(NB, WED);
    expect(got.map((g) => [g.text, g.struck])).toEqual([
      ["Finish the game", true],
    ]);

    // and once something is written, it is a list like any other
    await saveGoals(NB, MON, [...got, newGoal("Call dad")]);
    expect(await texts()).toEqual(["Finish the game", "Call dad"]);
    expect((await getWeekNote(NB, MON))?.goal).toBeUndefined();
  });
});
