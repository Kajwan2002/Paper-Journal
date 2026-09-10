import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, pageId } from "@/lib/db";
import { adopt, flushAsync, getCached } from "@/lib/pageStore";
import { moveLineTo, settleLegacySchedules } from "@/lib/schedule";
import { setStruckAcrossChain } from "@/lib/chain";
import { isStruck, newLine, tapSignifier } from "@/lib/rapidlog";
import { addDays, todayKey } from "@/lib/date";

const NB = "nb-move";
const T0 = todayKey();
const on = (d: string) => getCached(pageId(NB, d)) ?? [];
const textsOn = (d: string) => on(d).map((l) => l.text);

beforeEach(async () => {
  await db.pages.clear();
  for (let i = -4; i <= 40; i++) adopt(NB, addDays(T0, i), []);
});

describe("filing a task for a later day", () => {
  it("puts it on that day so you can see the week ahead", async () => {
    const target = addDays(T0, 33);
    const line = newLine("task", "book the ferry");
    adopt(NB, T0, [line]);

    await moveLineTo(NB, T0, line, target);

    // it is on the day you chose — flipping forward now shows it
    expect(textsOn(target)).toEqual(["book the ferry"]);
    expect(on(target)[0].carriedTo).toBeUndefined();
    expect(on(target)[0].origin).toBe(T0);
  });

  it("takes it off the day you wrote it — that is the point of sending it on", async () => {
    const target = addDays(T0, 3);
    const line = newLine("task", "book the ferry");
    adopt(NB, T0, [newLine("note", "keep me"), line]);

    await moveLineTo(NB, T0, line, target);

    expect(textsOn(T0)).toEqual(["keep me"]);
  });

  it("survives being filed again, without leaving a copy behind", async () => {
    const first = addDays(T0, 3);
    const second = addDays(T0, 9);
    const line = newLine("task", "book the ferry");
    adopt(NB, T0, [line]);

    await moveLineTo(NB, T0, line, first);
    const moved = on(first)[0];
    await moveLineTo(NB, first, moved, second);

    expect(textsOn(second)).toEqual(["book the ferry"]);
    expect(textsOn(first)).toEqual([]);
    expect(textsOn(T0)).toEqual([]);
    // exactly one copy anywhere in the chain
    const copies = [T0, first, second].flatMap((d) =>
      on(d).filter((l) => l.id === line.id),
    );
    expect(copies).toHaveLength(1);
  });

  it("has nothing left behind for a later strike to settle", async () => {
    const target = addDays(T0, 5);
    const line = newLine("priority", "book the ferry");
    adopt(NB, T0, [line]);
    await moveLineTo(NB, T0, line, target);

    const done = tapSignifier(on(target)[0]);
    adopt(NB, target, [done]);
    // the rollover breadcrumbs it may pick up later still get settled; the
    // day it was sent from simply has no copy to settle
    await setStruckAcrossChain(NB, done, true, target);

    expect(on(T0)).toEqual([]);
    expect(isStruck(on(target)[0])).toBe(true);
  });

  it("filing for today or the past just makes it open now", async () => {
    const line = { ...newLine("task", "do it now"), due: addDays(T0, 4) };
    adopt(NB, T0, [line]);

    await moveLineTo(NB, T0, line, T0);
    await flushAsync();

    expect(textsOn(T0)).toEqual(["do it now"]);
    expect(on(T0)[0].due).toBeUndefined();
    expect(on(T0)[0].carriedTo).toBeUndefined();
  });

  it("appends rather than replacing what is already on the target day", async () => {
    const target = addDays(T0, 2);
    adopt(NB, target, [newLine("note", "already here")]);
    const line = newLine("task", "book the ferry");
    adopt(NB, T0, [line]);

    await moveLineTo(NB, T0, line, target);

    expect(textsOn(target)).toEqual(["already here", "book the ferry"]);
  });
});

describe("repairing journals written before scheduling moved anything", () => {
  it("walks a stamped-but-stranded task onto its day", async () => {
    const target = addDays(T0, 6);
    const line = { ...newLine("task", "renew the passport"), due: target };
    await db.pages.put({
      id: pageId(NB, T0),
      notebookId: NB,
      date: T0,
      lines: [line],
      updatedAt: Date.now(),
    });
    adopt(NB, T0, [line]);

    await settleLegacySchedules(NB);

    expect(textsOn(target)).toEqual(["renew the passport"]);
    expect(textsOn(T0)).toEqual([]);
  });

  it("is safe to run twice", async () => {
    const target = addDays(T0, 6);
    const line = { ...newLine("task", "renew the passport"), due: target };
    await db.pages.put({
      id: pageId(NB, T0),
      notebookId: NB,
      date: T0,
      lines: [line],
      updatedAt: Date.now(),
    });
    adopt(NB, T0, [line]);

    await settleLegacySchedules(NB);
    await settleLegacySchedules(NB);

    expect(textsOn(target)).toEqual(["renew the passport"]);
  });
});
