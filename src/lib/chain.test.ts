import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pageId } from "@/lib/db";
import { adopt, getCached } from "@/lib/pageStore";
import { rolloverToToday } from "@/lib/rollover";
import { setStruckAcrossChain } from "@/lib/chain";
import { isStruck, newLine, tapSignifier } from "@/lib/rapidlog";
import { addDays, todayKey } from "@/lib/date";

const NB = "nb-chain";
const T0 = todayKey();

const on = (d: string) => getCached(pageId(NB, d)) ?? [];
const struckOn = (d: string, id: string) => {
  const line = on(d).find((l) => l.id === id);
  return line ? isStruck(line) : null;
};

beforeEach(async () => {
  await db.pages.clear();
  for (let i = -6; i <= 12; i++) adopt(NB, addDays(T0, i), []);
});

afterEach(() => {
  vi.useRealTimers();
});

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

describe("striking a task that was carried", () => {
  it("marks the day you filed it, not just the day you did it", async () => {
    // written on T0, filed for two days out
    const target = addDays(T0, 2);
    const line = { ...newLine("priority", "Hii"), due: target };
    await put(T0, [line]);

    // arrive on the day
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${target}T09:00:00`));
    await rolloverToToday(NB);
    expect(on(target).map((l) => l.text)).toEqual(["Hii"]);
    expect(struckOn(T0, line.id)).toBe(false); // the breadcrumb, still open

    // tick it off on the day it landed
    const live = on(target)[0];
    const done = tapSignifier(live);
    adopt(
      NB,
      target,
      on(target).map((l) => (l.id === done.id ? done : l)),
    );
    await setStruckAcrossChain(NB, done, true, target);

    expect(struckOn(target, line.id)).toBe(true);
    // ...and the day you wrote it now reads as done too
    expect(struckOn(T0, line.id)).toBe(true);
    // the breadcrumb is still a breadcrumb — it knows where it went
    expect(on(T0)[0].carriedTo).toBe(target);
  });

  it("marks every morning a task was carried through", async () => {
    // written six days ago and never done, so rollover walked it forward
    const start = addDays(T0, -3);
    await put(start, [newLine("task", "post the form")]);

    vi.useFakeTimers({ toFake: ["Date"] });
    for (let i = -2; i <= 0; i++) {
      vi.setSystemTime(new Date(`${addDays(T0, i)}T09:00:00`));
      await rolloverToToday(NB);
    }

    const live = on(T0)[0];
    expect(live.text).toBe("post the form");

    const done = tapSignifier(live);
    adopt(NB, T0, [done]);
    await setStruckAcrossChain(NB, done, true, T0);

    for (let i = -3; i <= 0; i++) {
      expect(struckOn(addDays(T0, i), live.id)).toBe(true);
    }
  });

  it("un-ticking travels back down the chain too", async () => {
    const start = addDays(T0, -2);
    await put(start, [newLine("task", "post the form")]);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${T0}T09:00:00`));
    await rolloverToToday(NB);

    const live = on(T0)[0];
    const done = tapSignifier(live);
    adopt(NB, T0, [done]);
    await setStruckAcrossChain(NB, done, true, T0);
    expect(struckOn(start, live.id)).toBe(true);

    const undone = tapSignifier(done);
    adopt(NB, T0, [undone]);
    await setStruckAcrossChain(NB, undone, false, T0);
    expect(struckOn(start, live.id)).toBe(false);
  });

  it("leaves other lines and other days alone", async () => {
    const start = addDays(T0, -2);
    const other = newLine("task", "unrelated");
    await put(start, [newLine("task", "post the form"), other]);
    await put(addDays(T0, -5), [newLine("task", "much older, untouched")]);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${T0}T09:00:00`));
    await rolloverToToday(NB);

    const live = on(T0).find((l) => l.text === "post the form")!;
    const done = tapSignifier(live);
    await setStruckAcrossChain(NB, done, true, T0);

    expect(struckOn(start, other.id)).toBe(false);
    expect(on(addDays(T0, -5)).every((l) => !isStruck(l))).toBe(true);
  });
});
