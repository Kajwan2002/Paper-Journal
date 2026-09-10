import { describe, expect, it } from "vitest";
import {
  isDue,
  isOpenTask,
  isStruck,
  newLine,
  parseLine,
  tapSignifier,
  type Line,
} from "@/lib/rapidlog";

const task = (over: Partial<Line> = {}): Line => ({
  ...newLine("task", "post the form"),
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
});
