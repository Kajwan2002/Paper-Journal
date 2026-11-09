import { describe, expect, it } from "vitest";
import { reviewMonth } from "@/lib/month";
import type { Page } from "@/lib/db";
import type { Line, LineKind } from "@/lib/rapidlog";

const NB = "nb";
const TODAY = "2026-11-20";

function line(id: string, text: string, extra: Partial<Line> = {}): Line {
  return { id, kind: "task" as LineKind, text, indent: 0, ...extra };
}

function page(date: string, lines: Line[]): Page {
  return {
    id: `${NB}__${date}`,
    notebookId: NB,
    date,
    lines,
    updatedAt: 1,
  };
}

const review = (pages: Page[], before: Page[] = [], learned = {}) =>
  reviewMonth(pages, "2026-11-01", learned, before, TODAY);

describe("the month grid", () => {
  it("has a cell for every day of the month and no more", () => {
    const r = review([]);
    expect(r.days).toHaveLength(30);
    expect(r.days[0].date).toBe("2026-11-01");
    expect(r.days[29].date).toBe("2026-11-30");
  });

  it("knows which days have happened", () => {
    const r = review([]);
    expect(r.days.find((d) => d.date === TODAY)?.isToday).toBe(true);
    expect(r.days.find((d) => d.date === "2026-11-19")?.future).toBe(false);
    expect(r.days.find((d) => d.date === "2026-11-21")?.future).toBe(true);
    // the days still to come are not counted as days you failed to write
    expect(r.daysSoFar).toBe(20);
  });

  it("ignores pages from other months", () => {
    const r = review([
      page("2026-10-31", [line("a", "October")]),
      page("2026-11-02", [line("b", "November")]),
      page("2026-12-01", [line("c", "December")]),
    ]);
    expect(r.daysWritten).toBe(1);
  });

  it("counts a blank line as nothing written", () => {
    const r = review([page("2026-11-02", [line("a", "   ")])]);
    expect(r.daysWritten).toBe(0);
  });

  it("finds the longest unbroken run", () => {
    const r = review(
      ["02", "03", "04", "07", "08", "09", "10", "11"].map((d) =>
        page(`2026-11-${d}`, [line(`l${d}`, "wrote")]),
      ),
    );
    expect(r.streak).toBe(5);
  });
});

describe("counting what was finished", () => {
  it("counts a carried task once, not once per morning", () => {
    // The bug this guards is the one the weekly tally already made: every
    // copy of a carried task shares one id, so counting rows scores a task
    // you dragged through a week seven times.
    const pages = ["10", "11", "12", "13"].map((d, i) =>
      page(`2026-11-${d}`, [
        line("taxes", "Do the taxes", {
          rolls: i,
          struck: d === "13",
          carriedTo: d === "13" ? undefined : `2026-11-${Number(d) + 1}`,
        }),
      ]),
    );
    const r = review(pages);
    expect(r.finished).toBe(1);
  });

  it("only counts tasks, not notes or events", () => {
    const r = review([
      page("2026-11-02", [
        line("a", "Lunch", { struck: true }),
        line("b", "a thought", { kind: "note", struck: true }),
        line("c", "dentist", { kind: "event", struck: true }),
        line("d", "Big one", { kind: "priority", struck: true }),
      ]),
    ]);
    expect(r.finished).toBe(2);
  });

  it("ignores deleted lines", () => {
    const r = review([
      page("2026-11-02", [
        line("a", "real", { struck: true }),
        line("b", "gone", { struck: true, deletedAt: 1 }),
      ]),
    ]);
    expect(r.finished).toBe(1);
  });
});

describe("what the month was made of", () => {
  it("counts each task's drawing once however long it was carried", () => {
    const pages = ["10", "11", "12"].map((d) =>
      page(`2026-11-${d}`, [
        line("g", "gym", { carriedTo: d === "12" ? undefined : "2026-11-12" }),
      ]),
    );
    expect(review(pages).drawings).toEqual([{ icon: "dumbbell", count: 1 }]);
  });

  it("ranks them, commonest first", () => {
    const r = review([
      page("2026-11-02", [
        line("a", "gym"),
        line("b", "gym again", { id: "b" }),
        line("c", "coffee"),
      ]),
      page("2026-11-03", [line("d", "gym")]),
    ]);
    expect(r.drawings[0]).toEqual({ icon: "dumbbell", count: 3 });
    expect(r.drawings[1]).toEqual({ icon: "coffee", count: 1 });
  });

  it("respects what the notebook has been taught", () => {
    const pages = [page("2026-11-02", [line("a", "qutabxane")])];
    expect(review(pages).drawings).toEqual([]);
    expect(review(pages, [], { qutabxane: "book" as const }).drawings).toEqual([
      { icon: "book", count: 1 },
    ]);
  });
});

describe("what it cost", () => {
  it("names what you kept moving and never did", () => {
    const r = review([
      page("2026-11-18", [
        line("a", "Ring the dentist", { rolls: 9 }),
        line("d", "Twice over", { rolls: 2 }),
        // one carry is an ordinary morning, not a cost
        line("b", "Easy one", { rolls: 1 }),
        // and a thing you did is not a cost however long it took
        line("c", "Finished one", { rolls: 12, struck: true }),
      ]),
    ]);
    expect(r.clung.map((c) => c.text)).toEqual([
      "Ring the dentist",
      "Twice over",
    ]);
    expect(r.clung[0].rolls).toBe(9);
  });

  it("still counts a deadline missed after the task moved into next month", () => {
    // The task was carried out of the month, so the only copy left here is
    // a breadcrumb. Counting only live lines made the miss disappear and
    // left the month reporting nothing but its successes.
    const r = review([
      page("2026-11-10", [
        line("f", "Send the form", {
          deadline: "2026-11-12",
          carriedTo: "2026-12-01",
          rolls: 4,
        }),
      ]),
    ]);
    expect(r.deadlines).toEqual({ met: 0, missed: 1 });
  });

  it("scores a deadline met if any copy of the task was struck", () => {
    const r = review([
      page("2026-11-10", [
        line("x", "Essay", { deadline: "2026-11-15", carriedTo: "2026-11-14" }),
      ]),
      page("2026-11-14", [
        line("x", "Essay", { deadline: "2026-11-15", struck: true }),
      ]),
      page("2026-11-11", [line("y", "Form", { deadline: "2026-11-12" })]),
      page("2026-11-12", [line("z", "Later", { deadline: "2026-11-28" })]),
    ]);
    // "Later" is neither: its day has not come, so there is nothing to say
    expect(r.deadlines).toEqual({ met: 1, missed: 1 });
  });
});

describe("the remarks", () => {
  const manyOn = (weekday: string[], extra = 0) => {
    const pages = weekday.map((d, i) =>
      page(`2026-11-${d}`, [line(`f${i}`, "done", { struck: true })]),
    );
    for (let i = 0; i < extra; i++) {
      pages.push(
        page(`2026-11-0${(i % 5) + 1}`, [
          line(`x${i}`, "done", { struck: true }),
        ]),
      );
    }
    return pages;
  };

  it("says nothing at all about a month with almost nothing in it", () => {
    const r = review([page("2026-11-02", [line("a", "one thing")])]);
    expect(r.remarks).toEqual([]);
  });

  it("won't claim a favourite weekday from a handful of tasks", () => {
    // four Tuesdays is a coincidence, not a pattern
    const r = review(manyOn(["03", "10", "17", "24"]));
    expect(r.remarks.join(" ")).not.toMatch(/Tuesday/);
  });

  it("names one once the shape is actually there", () => {
    // Tuesdays carry eight of fourteen — a real lean, not an even spread
    const pages = [
      ...["03", "10", "17", "24"].map((d) =>
        page(`2026-11-${d}`, [
          line(`t${d}a`, "done", { struck: true }),
          line(`t${d}b`, "done", { struck: true }),
        ]),
      ),
      ...["04", "05", "06", "11", "12", "13"].map((d) =>
        page(`2026-11-${d}`, [line(`o${d}`, "done", { struck: true })]),
      ),
    ];
    const r = review(pages);
    expect(r.finished).toBe(14);
    expect(r.remarks.join(" ")).toMatch(/You finish most on Tuesdays/);
  });

  it("stays quiet when the week is evenly spread", () => {
    // fourteen finished, two on each day: there is no favourite here and
    // naming one would be the notebook making something up
    const pages = [
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
      "09",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15",
    ].map((d) =>
      page(`2026-11-${d}`, [line(`e${d}`, "done", { struck: true })]),
    );
    const r = review(pages);
    expect(r.finished).toBe(14);
    expect(r.remarks.join(" ")).not.toMatch(/You finish most on/);
  });

  it("calls out something you have dragged for weeks", () => {
    const r = review([
      page("2026-11-18", [line("a", "Ring the dentist", { rolls: 9 })]),
    ]);
    expect(r.remarks).toContain("“Ring the dentist” has moved 9 mornings.");
  });

  it("stays quiet about one you have only moved twice", () => {
    const r = review([
      page("2026-11-18", [line("a", "Ring the dentist", { rolls: 2 })]),
    ]);
    expect(r.remarks.join(" ")).not.toMatch(/dentist/);
  });

  it("compares to last month only when both are worth comparing", () => {
    const thin = review(
      [page("2026-11-02", [line("a", "x", { struck: true })])],
      [page("2026-10-02", [line("b", "y", { struck: true })])],
    );
    expect(thin.remarks.join(" ")).not.toMatch(/last month/);

    const fat = review(
      Array.from({ length: 14 }, (_, i) =>
        page(`2026-11-${`${i + 1}`.padStart(2, "0")}`, [
          line(`n${i}`, "done", { struck: true }),
        ]),
      ),
      Array.from({ length: 4 }, (_, i) =>
        page(`2026-10-${`${i + 1}`.padStart(2, "0")}`, [
          line(`o${i}`, "done", { struck: true }),
        ]),
      ),
    );
    expect(fat.remarks.join(" ")).toMatch(/10 more finished than last month/);
  });

  it("never says more than three things", () => {
    const r = review(
      [
        ...Array.from({ length: 20 }, (_, i) =>
          page(`2026-11-${`${i + 1}`.padStart(2, "0")}`, [
            line(`n${i}`, "done", { struck: true }),
            line(`c${i}`, "Ring the dentist", { rolls: 11 }),
          ]),
        ),
      ],
      [page("2026-10-02", [line("o", "done", { struck: true })])],
    );
    expect(r.remarks.length).toBeLessThanOrEqual(3);
  });
});
