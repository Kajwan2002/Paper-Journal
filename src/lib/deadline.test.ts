import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, pageId } from "@/lib/db";
import { adopt } from "@/lib/pageStore";
import {
  comingDue,
  deadlineLabel,
  deadlines,
  urgencyOf,
  WARN_DAYS,
} from "@/lib/deadline";
import { glyphFor, newLine, tapSignifier } from "@/lib/rapidlog";
import { addDays, todayKey } from "@/lib/date";

const NB = "nb-deadline";
const T0 = todayKey();

describe("urgencyOf", () => {
  it("escalates as the day approaches, and keeps going past it", () => {
    expect(urgencyOf(addDays(T0, 30), T0)).toBe("later");
    expect(urgencyOf(addDays(T0, WARN_DAYS), T0)).toBe("soon");
    expect(urgencyOf(addDays(T0, 2), T0)).toBe("close");
    expect(urgencyOf(T0, T0)).toBe("today");
    expect(urgencyOf(addDays(T0, -1), T0)).toBe("late");
  });
});

describe("deadlineLabel", () => {
  it("counts down near the day and names the date when it is far off", () => {
    expect(deadlineLabel(T0, T0)).toBe("due today");
    expect(deadlineLabel(addDays(T0, 1), T0)).toBe("due tomorrow");
    expect(deadlineLabel(addDays(T0, 4), T0)).toBe("4 days left");
    expect(deadlineLabel(addDays(T0, -1), T0)).toBe("1 day late");
    expect(deadlineLabel(addDays(T0, -3), T0)).toBe("3 days late");
    expect(deadlineLabel(addDays(T0, 40), T0)).toMatch(/^by /);
  });
});

describe("the mark on a line", () => {
  it("changes shape for a deadline, without anyone choosing an icon", () => {
    expect(glyphFor(newLine("task", "plain"))).toBe("•");
    expect(glyphFor({ ...newLine("task", "x"), deadline: T0 })).toBe("◇");
    // and a priority with a deadline is still marked as answering to a date
    expect(glyphFor({ ...newLine("priority", "x"), deadline: T0 })).toBe("◇");
  });

  it("goes back to a cross once it is done", () => {
    const line = { ...newLine("task", "x"), deadline: T0 };
    expect(glyphFor(tapSignifier(line))).toBe("×");
  });

  it("drops the deadline when the task is finished", () => {
    const line = { ...newLine("task", "x"), deadline: T0 };
    expect(tapSignifier(line).deadline).toBeUndefined();
  });
});

describe("finding deadlines across the notebook", () => {
  beforeEach(async () => {
    await db.pages.clear();
    for (let i = -3; i <= 40; i++) adopt(NB, addDays(T0, i), []);
  });

  const put = async (date: string, lines: ReturnType<typeof newLine>[]) => {
    await db.pages.put({
      id: pageId(NB, date),
      notebookId: NB,
      date,
      lines,
      updatedAt: Date.now(),
    });
    adopt(NB, date, lines);
  };

  it("finds one sitting on a page weeks away — the whole point", async () => {
    const far = addDays(T0, 25);
    await put(far, [
      { ...newLine("task", "file the tax return"), deadline: addDays(T0, 3) },
    ]);

    const found = await comingDue(NB);
    expect(found.map((d) => d.line.text)).toEqual(["file the tax return"]);
    expect(found[0].date).toBe(far); // it lives there, but it warns here
  });

  it("keeps quiet about one that is still far off", async () => {
    await put(T0, [
      { ...newLine("task", "renew the lease"), deadline: addDays(T0, 40) },
    ]);
    expect(await comingDue(NB)).toEqual([]);
    // ...but it is still a deadline
    expect((await deadlines(NB)).map((d) => d.line.text)).toEqual([
      "renew the lease",
    ]);
  });

  it("puts the most urgent first", async () => {
    await put(T0, [
      { ...newLine("task", "later"), deadline: addDays(T0, 5) },
      { ...newLine("task", "overdue"), deadline: addDays(T0, -2) },
      { ...newLine("task", "today"), deadline: T0 },
    ]);
    expect((await comingDue(NB)).map((d) => d.line.text)).toEqual([
      "overdue",
      "today",
      "later",
    ]);
  });

  it("ignores finished work, breadcrumbs and someday", async () => {
    await put(T0, [
      { ...newLine("task", "done"), deadline: T0, struck: true },
      {
        ...newLine("task", "moved on"),
        deadline: T0,
        carriedTo: addDays(T0, 1),
      },
      { ...newLine("task", "parked"), deadline: T0, someday: true },
      { ...newLine("task", "real"), deadline: T0 },
    ]);
    expect((await comingDue(NB)).map((d) => d.line.text)).toEqual(["real"]);
  });
});
