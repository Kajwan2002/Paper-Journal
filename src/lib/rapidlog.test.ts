import { describe, expect, it } from "vitest";
import {
  childRangeOf,
  isDue,
  isOpenTask,
  isStruck,
  newLine,
  parseLine,
  tapSignifier,
  toggleWithChildren,
  type Line,
} from "@/lib/rapidlog";

const task = (over: Partial<Line> = {}): Line => ({
  ...newLine("task", "post the form"),
  ...over,
});

const child = (text: string, over: Partial<Line> = {}): Line => ({
  ...newLine("note", text, 1),
  ...over,
});

describe("parseLine", () => {
  it("reads the signifier prefixes and strips them", () => {
    expect(parseLine("- buy milk")).toEqual({ kind: "task", text: "buy milk" });
    expect(parseLine("* rent")).toEqual({ kind: "priority", text: "rent" });
    expect(parseLine("o dentist")).toEqual({ kind: "event", text: "dentist" });
    expect(parseLine("~ a thought")).toEqual({
      kind: "idea",
      text: "a thought",
    });
    expect(parseLine("x done thing")).toEqual({
      kind: "task",
      struck: true,
      text: "done thing",
    });
  });

  it("treats anything else as a note", () => {
    expect(parseLine("just writing")).toEqual({
      kind: "note",
      text: "just writing",
    });
  });

  it("needs the space — a word starting with x is not a done task", () => {
    expect(parseLine("xylophone").kind).toBe("note");
  });
});

describe("tapSignifier", () => {
  it("promotes an idea to a task before it strikes anything", () => {
    const idea = newLine("idea", "a thought");
    expect(tapSignifier(idea).kind).toBe("task");
    expect(isStruck(tapSignifier(idea))).toBe(false);
  });

  it("toggles struck both ways", () => {
    const done = tapSignifier(task());
    expect(isStruck(done)).toBe(true);
    expect(isStruck(tapSignifier(done))).toBe(false);
  });

  it("retires the schedule and the nag when something is finished", () => {
    const done = tapSignifier(task({ due: "2026-09-20", rolls: 6 }));
    expect(done.due).toBeUndefined();
    expect(done.rolls).toBe(0);
  });

  it("normalises the legacy done kind", () => {
    expect(tapSignifier(newLine("done", "old")).kind).toBe("task");
  });
});

describe("isOpenTask", () => {
  it("is true only for unfinished task-ish lines with text", () => {
    expect(isOpenTask(task())).toBe(true);
    expect(isOpenTask(task({ struck: true }))).toBe(false);
    expect(isOpenTask(task({ text: "   " }))).toBe(false);
    expect(isOpenTask(newLine("note", "a note"))).toBe(false);
    expect(isOpenTask(newLine("event", "dentist"))).toBe(false);
  });
});

describe("childRangeOf", () => {
  it("gathers the indented lines directly beneath an unindented one", () => {
    const lines = [
      task({ text: "Rewe Shopping" }),
      child("Cola"),
      child("Grill Peppers"),
      task({ text: "Ausländer Email" }),
    ];
    expect(childRangeOf(lines, 0)).toEqual([1, 3]);
    expect(lines.slice(...childRangeOf(lines, 0)).map((l) => l.text)).toEqual([
      "Cola",
      "Grill Peppers",
    ]);
  });

  it("is empty for a line with nothing indented under it", () => {
    const lines = [task({ text: "Breakfast" }), task({ text: "Work" })];
    expect(childRangeOf(lines, 0)).toEqual([1, 1]);
  });

  it("is empty when the line itself is a child — one level is all there is", () => {
    const lines = [task({ text: "Rewe Shopping" }), child("Cola")];
    expect(childRangeOf(lines, 1)).toEqual([1, 1]);
  });

  it("stops at the end of the list", () => {
    const lines = [task({ text: "Rewe Shopping" }), child("Cola")];
    expect(childRangeOf(lines, 0)).toEqual([1, 2]);
  });
});

describe("toggleWithChildren", () => {
  it("crosses off every indented line beneath the one tapped", () => {
    const lines = [
      task({ text: "Rewe Shopping", kind: "priority" }),
      child("Cola"),
      child("Grill Peppers"),
    ];
    const after = toggleWithChildren(lines, lines[0].id);
    expect(after.every(isStruck)).toBe(true);
  });

  it("un-strikes the group the same way", () => {
    const struck = [
      { ...task({ text: "Rewe Shopping" }), struck: true },
      child("Cola", { struck: true }),
    ];
    const after = toggleWithChildren(struck, struck[0].id);
    expect(after.every((l) => !isStruck(l))).toBe(true);
  });

  it("leaves a line's own kind, id and text alone — only struck moves", () => {
    const lines = [task({ text: "Rewe Shopping" }), child("Cola")];
    const after = toggleWithChildren(lines, lines[0].id);
    expect(after[1].id).toBe(lines[1].id);
    expect(after[1].text).toBe("Cola");
    expect(after[1].kind).toBe("note");
  });

  it("retires a child's own schedule when the group finishes", () => {
    const lines = [
      task({ text: "Rewe Shopping" }),
      child("Cola", { due: "2026-09-20", rolls: 3 }),
    ];
    const after = toggleWithChildren(lines, lines[0].id);
    expect(after[1].due).toBeUndefined();
    expect(after[1].rolls).toBe(0);
  });

  it("tapping a child only changes that child", () => {
    const lines = [
      task({ text: "Rewe Shopping" }),
      child("Cola"),
      child("Grill Peppers"),
    ];
    const after = toggleWithChildren(lines, lines[1].id);
    expect(isStruck(after[0])).toBe(false);
    expect(isStruck(after[1])).toBe(true);
    expect(isStruck(after[2])).toBe(false);
  });

  it("leaves an unrelated line alone", () => {
    const lines = [
      task({ text: "Rewe Shopping" }),
      child("Cola"),
      task({ text: "Ausländer Email" }),
    ];
    const after = toggleWithChildren(lines, lines[0].id);
    expect(isStruck(after[2])).toBe(false);
  });

  it("does nothing for an id that isn't there", () => {
    const lines = [task({ text: "Rewe Shopping" })];
    expect(toggleWithChildren(lines, "missing")).toBe(lines);
  });
});

describe("isDue", () => {
  const today = "2026-09-10";

  it("is due when unscheduled", () => {
    expect(isDue(task(), today)).toBe(true);
  });

  it("is not due before its day", () => {
    expect(isDue(task({ due: "2026-09-12" }), today)).toBe(false);
  });

  it("is due on and after its day", () => {
    expect(isDue(task({ due: today }), today)).toBe(true);
    expect(isDue(task({ due: "2026-09-01" }), today)).toBe(true);
  });

  it("is never due while parked in someday", () => {
    expect(isDue(task({ someday: true }), today)).toBe(false);
  });

  it("is never due once struck", () => {
    expect(isDue(task({ struck: true }), today)).toBe(false);
  });

  it("sits quietly on a deadline alone, until the deadline itself arrives", () => {
    expect(isDue(task({ deadline: "2026-09-12" }), today)).toBe(false);
    expect(isDue(task({ deadline: today }), today)).toBe(true);
    expect(isDue(task({ deadline: "2026-09-01" }), today)).toBe(true);
  });

  it("a due date still wins over a deadline that hasn't arrived", () => {
    expect(
      isDue(task({ due: "2026-09-11", deadline: "2026-09-20" }), today),
    ).toBe(false);
  });
});
