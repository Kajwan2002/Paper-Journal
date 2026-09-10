import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, pageId } from "@/lib/db";
import { adopt, getCached } from "@/lib/pageStore";
import { openLoops, rolloverToToday } from "@/lib/rollover";
import { newLine, type Line } from "@/lib/rapidlog";
import { addDays, todayKey } from "@/lib/date";

const NB = "nb-test";
const today = todayKey();

async function put(date: string, lines: Line[]) {
  await db.pages.put({
    id: pageId(NB, date),
    notebookId: NB,
    date,
    lines,
    updatedAt: Date.now(),
  });
  adopt(NB, date, lines); // keep the in-memory cache honest
}

const linesOn = (date: string) => getCached(pageId(NB, date)) ?? [];
const texts = (date: string) => linesOn(date).map((l) => l.text);

beforeEach(async () => {
  await db.pages.clear();
  for (const d of [-90, -40, -8, -3, -1, 0, 1]) {
    adopt(NB, addDays(today, d), []);
  }
});

describe("rolloverToToday", () => {
  it("carries an unfinished task forward and leaves a breadcrumb", async () => {
    const yesterday = addDays(today, -1);
    await put(yesterday, [newLine("task", "post the form")]);

    await rolloverToToday(NB);

    expect(texts(today)).toEqual(["post the form"]);
    expect(linesOn(today)[0].kind).toBe("migrated");
    expect(linesOn(today)[0].rolls).toBe(1);
    expect(linesOn(today)[0].origin).toBe(yesterday);
    // the day it left keeps a permanent, stamped breadcrumb
    expect(linesOn(yesterday)[0].carriedTo).toBe(today);
    expect(linesOn(yesterday)[0].kind).toBe("migrated");
  });

  it("is idempotent — running it twice carries nothing extra", async () => {
    await put(addDays(today, -1), [newLine("task", "post the form")]);
    await rolloverToToday(NB);
    await rolloverToToday(NB);
    expect(texts(today)).toEqual(["post the form"]);
  });

  it("leaves finished, note and event lines where they are", async () => {
    const y = addDays(today, -1);
    await put(y, [
      { ...newLine("task", "done thing"), struck: true },
      newLine("note", "the weather turned"),
      newLine("event", "dentist"),
    ]);
    await rolloverToToday(NB);
    expect(texts(today)).toEqual([]);
    expect(linesOn(y).every((l) => !l.carriedTo)).toBe(true);
  });

  it("still finds a task older than the old 30-day window", async () => {
    // this is the regression: coming back from a long break used to orphan
    // everything written more than a month ago
    await put(addDays(today, -90), [newLine("task", "the forgotten thing")]);
    await rolloverToToday(NB);
    expect(texts(today)).toEqual(["the forgotten thing"]);
  });

  it("does not carry a task scheduled for a later day", async () => {
    await put(addDays(today, -1), [
      { ...newLine("task", "renew the passport"), due: addDays(today, 3) },
    ]);
    await rolloverToToday(NB);
    expect(texts(today)).toEqual([]);
  });

  it("carries a scheduled task once its day arrives", async () => {
    await put(addDays(today, -3), [
      { ...newLine("task", "renew the passport"), due: today },
    ]);
    await rolloverToToday(NB);
    expect(texts(today)).toEqual(["renew the passport"]);
    expect(linesOn(today)[0].due).toBeUndefined();
  });

  it("never carries a someday task", async () => {
    await put(addDays(today, -8), [
      { ...newLine("task", "learn the cello"), someday: true },
    ]);
    await rolloverToToday(NB);
    expect(texts(today)).toEqual([]);
  });

  it("keeps what is already written on today and appends after it", async () => {
    await put(today, [newLine("note", "woke up early")]);
    await put(addDays(today, -1), [newLine("task", "post the form")]);
    await rolloverToToday(NB);
    expect(texts(today)).toEqual(["woke up early", "post the form"]);
  });

  it("counts each morning it has been carried", async () => {
    await put(addDays(today, -3), [
      { ...newLine("task", "the nagging one"), rolls: 2 },
    ]);
    await rolloverToToday(NB);
    expect(linesOn(today)[0].rolls).toBe(3);
  });

  it("touches nothing when there is nothing to carry", async () => {
    await put(addDays(today, -1), [newLine("note", "quiet day")]);
    const before = await db.pages.get(pageId(NB, today));
    await rolloverToToday(NB);
    expect(await db.pages.get(pageId(NB, today))).toEqual(before);
  });
});

describe("openLoops", () => {
  it("lists live commitments and skips breadcrumbs and finished work", async () => {
    await put(addDays(today, -3), [newLine("task", "old one")]);
    await put(addDays(today, -1), [
      { ...newLine("task", "already moved"), carriedTo: today },
      { ...newLine("task", "finished"), struck: true },
      { ...newLine("task", "parked"), someday: true },
    ]);
    await rolloverToToday(NB);

    const loops = await openLoops(NB);
    const found = loops.map((l) => l.line.text).sort();
    expect(found).toEqual(["old one", "parked"]);
  });

  it("puts the most recent page first", async () => {
    await put(addDays(today, -8), [newLine("task", "older")]);
    await put(addDays(today, -1), [newLine("task", "newer")]);
    const loops = await openLoops(NB);
    expect(loops[0].line.text).toBe("newer");
  });
});
