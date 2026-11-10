import "fake-indexeddb/auto";
import { describe, expect, it, beforeEach } from "vitest";

const { db } = await import("@/lib/db");
const { hideThing, trackThing, renameThing, loadPrefs, hiddenThings } =
  await import("@/lib/things");

beforeEach(async () => {
  await db.thingPrefs.clear();
});

describe("keeping the month list", () => {
  it("removes every word a row stood for", async () => {
    await hideThing(["add", "excel"]);
    const prefs = await loadPrefs();
    expect(prefs.add?.hidden).toBe(true);
    expect(prefs.excel?.hidden).toBe(true);
  });

  it("offers a removal back as the row it was, not word by word", async () => {
    // putting "add excel" back must not bring back a lone "add"
    await hideThing(["add", "excel"]);
    await hideThing(["money"]);
    expect(await loadPrefs().then(hiddenThings)).toEqual([
      ["add", "excel"],
      ["money"],
    ]);
  });

  it("brings the whole row back together", async () => {
    await hideThing(["add", "excel"]);
    const [group] = hiddenThings(await loadPrefs());
    await trackThing(...group);
    const prefs = await loadPrefs();
    expect(prefs.add?.hidden).toBe(false);
    expect(prefs.excel?.hidden).toBe(false);
    expect(hiddenThings(prefs)).toEqual([]);
  });

  it("keeps a removed row out of the list even half restored", async () => {
    // a group only lists the words still hidden, so a half-restored row
    // cannot offer a word that is already back
    await hideThing(["add", "excel"]);
    await trackThing("add");
    expect(await loadPrefs().then(hiddenThings)).toEqual([["excel"]]);
  });

  it("names a thing, and unnames it", async () => {
    await renameThing(["add", "excel"], "Spreadsheets");
    expect((await loadPrefs()).excel?.label).toBe("Spreadsheets");
    await renameThing(["add", "excel"], "   ");
    expect((await loadPrefs()).excel?.label).toBeUndefined();
  });

  it("ignores an empty word rather than storing a blank row", async () => {
    await trackThing("   ");
    expect(await db.thingPrefs.count()).toBe(0);
  });

  it("keys on the word however it was typed", async () => {
    await trackThing("  Pottery  ");
    expect((await loadPrefs()).pottery?.tracked).toBe(true);
  });
});
