import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pageId } from "@/lib/db";
import { adopt, getCached } from "@/lib/pageStore";
import { rolloverToToday } from "@/lib/rollover";
import { newLine } from "@/lib/rapidlog";
import { todayKey, addDays } from "@/lib/date";

/** The `due` fallback, walked one day at a time.
 *
 *  Filing a task for a later day *moves* it there now — see
 *  schedule-move.test.ts. This covers the older shape, where a task stayed
 *  where it was written carrying a `due` stamp: journals written before the
 *  change still contain those, and rollover has to keep honouring them
 *  until `settleLegacySchedules` has walked them onto their day. */

const NB = "nb-sched";
const T0 = todayKey();
const TARGET = addDays(T0, 10);

const on = (d: string) => getCached(pageId(NB, d)) ?? [];
const textsOn = (d: string) => on(d).map((l) => l.text);

beforeEach(async () => {
  await db.pages.clear();
  for (let i = -2; i <= 20; i++) adopt(NB, addDays(T0, i), []);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a legacy task stamped for a day ten days out", () => {
  beforeEach(async () => {
    const line = { ...newLine("priority", "Hii"), due: TARGET };
    await db.pages.put({
      id: pageId(NB, T0),
      notebookId: NB,
      date: T0,
      lines: [line],
      updatedAt: Date.now(),
    });
    adopt(NB, T0, [line]);
  });

  it("stays on the page it was written on, and the target day is empty", () => {
    expect(textsOn(T0)).toEqual(["Hii"]);
    expect(textsOn(TARGET)).toEqual([]);
  });

  it("arrives on the target day, leaving a breadcrumb behind", async () => {
    // walk the clock forward to the day itself
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${TARGET}T09:00:00`));

    await rolloverToToday(NB);

    expect(textsOn(TARGET)).toEqual(["Hii"]);
    expect(on(TARGET)[0].kind).toBe("migrated");
    expect(on(TARGET)[0].due).toBeUndefined(); // its day came; simply open now

    // the page it was written on keeps a permanent breadcrumb
    expect(on(T0)[0].carriedTo).toBe(TARGET);
    expect(on(T0)[0].kind).toBe("migrated");
  });

  it("lands on the day you open the app if you miss the target", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const late = addDays(TARGET, 5);
    vi.setSystemTime(new Date(`${late}T09:00:00`));

    await rolloverToToday(NB);

    expect(textsOn(TARGET)).toEqual([]); // never opened it, nothing landed
    expect(textsOn(late)).toEqual(["Hii"]); // it is waiting, and overdue
  });

  it("is not carried on any of the days in between", async () => {
    // rollover always targets the real today, so the in-between days are
    // simply days on which nothing moves
    for (let i = 1; i < 10; i++) {
      await rolloverToToday(NB);
      expect(textsOn(addDays(T0, i))).toEqual([]);
    }
    // and it is still sitting where it was written, the whole time
    expect(textsOn(T0)).toEqual(["Hii"]);
    expect(on(T0)[0].due).toBe(TARGET);
    expect(on(T0)[0].carriedTo).toBeUndefined();
  });
});
