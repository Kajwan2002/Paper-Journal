import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, pageId } from "@/lib/db";
import { adopt, getCached } from "@/lib/pageStore";
import { toggleStruck } from "@/lib/tick";
import { isStruck, newLine } from "@/lib/rapidlog";
import { addDays, todayKey } from "@/lib/date";

const NB = "nb-tick";
const T0 = todayKey();

const on = (d: string) => getCached(pageId(NB, d)) ?? [];

beforeEach(async () => {
  await db.pages.clear();
  for (let i = -3; i <= 3; i++) adopt(NB, addDays(T0, i), []);
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

describe("toggleStruck", () => {
  it("crosses off a group when the parent is ticked, exactly what Open Loops and the page both do", async () => {
    const parent = newLine("priority", "Rewe Shopping");
    const cola = newLine("note", "Cola", 1);
    const peppers = newLine("note", "Grill Peppers", 1);
    await put(T0, [parent, cola, peppers]);

    await toggleStruck(NB, T0, parent);

    expect(on(T0).every(isStruck)).toBe(true);
  });

  it("leaves a sibling task untouched", async () => {
    const parent = newLine("priority", "Rewe Shopping");
    const cola = newLine("note", "Cola", 1);
    const email = newLine("task", "Ausländer Email");
    await put(T0, [parent, cola, email]);

    await toggleStruck(NB, T0, parent);

    expect(isStruck(on(T0)[0])).toBe(true);
    expect(isStruck(on(T0)[1])).toBe(true);
    expect(isStruck(on(T0)[2])).toBe(false);
  });

  it("un-strikes the whole group the same way", async () => {
    const parent = { ...newLine("priority", "Rewe Shopping"), struck: true };
    const cola = { ...newLine("note", "Cola", 1), struck: true };
    await put(T0, [parent, cola]);

    await toggleStruck(NB, T0, parent);

    expect(on(T0).every((l) => !isStruck(l))).toBe(true);
  });

  it("ticking a child alone only strikes that child", async () => {
    const parent = newLine("priority", "Rewe Shopping");
    const cola = newLine("note", "Cola", 1);
    const peppers = newLine("note", "Grill Peppers", 1);
    await put(T0, [parent, cola, peppers]);

    await toggleStruck(NB, T0, cola);

    expect(isStruck(on(T0)[0])).toBe(false);
    expect(isStruck(on(T0)[1])).toBe(true);
    expect(isStruck(on(T0)[2])).toBe(false);
  });

  it("carries the strike across a chain for every line that changed, parent and children alike", async () => {
    // both parent and child were carried forward from three days ago
    const start = addDays(T0, -3);
    const parent = newLine("priority", "Rewe Shopping");
    const cola = newLine("note", "Cola", 1);
    await put(start, [parent, cola]);

    // simulate what rollover would have done: a breadcrumb on the old page,
    // live copies on today, sharing the same ids
    await put(start, [
      { ...parent, kind: "migrated", carriedTo: T0 },
      { ...cola, carriedTo: T0 },
    ]);
    await put(T0, [
      { ...parent, kind: "migrated", origin: start },
      { ...cola, origin: start },
    ]);

    await toggleStruck(NB, T0, on(T0)[0]);

    // both the live copies and the breadcrumbs they left behind read as done
    expect(isStruck(on(T0)[0])).toBe(true);
    expect(isStruck(on(T0)[1])).toBe(true);
    expect(isStruck(on(start)[0])).toBe(true);
    expect(isStruck(on(start)[1])).toBe(true);
  });
});
