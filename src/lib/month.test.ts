import { describe, expect, it } from "vitest";
import { reviewMonth } from "@/lib/month";
import type { Page } from "@/lib/db";
import type { Line, LineKind } from "@/lib/rapidlog";

const NB = "nb";

/** Crossed off by default: that is what the page counts, so it is what
 *  most of these tests are about. */
function line(id: string, text: string, extra: Partial<Line> = {}): Line {
  return {
    id,
    kind: "task" as LineKind,
    text,
    indent: 0,
    struck: true,
    ...extra,
  };
}

function page(date: string, lines: Line[]): Page {
  return { id: `${NB}__${date}`, notebookId: NB, date, lines, updatedAt: 1 };
}

const review = (pages: Page[], learned = {}, floor = 2) =>
  reviewMonth(pages, "2026-11-01", learned, floor);

/** word → times crossed off */
const counts = (pages: Page[], learned = {}, floor = 2) =>
  Object.fromEntries(
    review(pages, learned, floor).things.map((t) => [t.word, t.done]),
  );

/** word → "done of written" */
const pairs = (pages: Page[], learned = {}, floor = 2) =>
  Object.fromEntries(
    review(pages, learned, floor).things.map((t) => [
      t.word,
      `${t.done} of ${t.written}`,
    ]),
  );

describe("how many times you did a thing", () => {
  it("counts the thing, not the day", () => {
    const r = counts([
      page("2026-11-02", [line("a", "guitar")]),
      page("2026-11-05", [line("b", "played guitar for an hour")]),
      page("2026-11-09", [line("c", "Guitar")]),
    ]);
    expect(r.guitar ?? r.Guitar).toBe(3);
  });

  it("gives both numbers: crossed off, and written down", () => {
    const r = pairs([
      page("2026-11-02", [line("a", "guitar")]),
      page("2026-11-03", [line("b", "guitar")]),
      page("2026-11-04", [line("c", "guitar", { struck: false })]),
    ]);
    expect(r.guitar).toBe("2 of 3");
  });

  it("still lists a thing written down and never crossed off", () => {
    // a notebook kept as a log would otherwise read as an empty month
    const r = pairs([
      page("2026-11-02", [line("a", "guitar", { struck: false })]),
      page("2026-11-03", [line("b", "guitar", { struck: false })]),
    ]);
    expect(r.guitar).toBe("0 of 2");
  });

  it("leads with the crossings, and falls back to what was written", () => {
    const r = review(
      [
        // crossed off twice, written twice
        page("2026-11-02", [
          line("a", "gym"),
          line("b", "emails", { struck: false }),
        ]),
        page("2026-11-03", [
          line("c", "gym"),
          line("d", "emails", { struck: false }),
        ]),
        // written four times, never crossed off
        page("2026-11-04", [line("e", "emails", { struck: false })]),
        page("2026-11-05", [line("f", "emails", { struck: false })]),
      ],
      {},
      1,
    );
    expect(r.things.map((t) => [t.word, t.done, t.written])).toEqual([
      ["gym", 2, 2],
      ["emails", 0, 4],
    ]);
  });

  it("counts a crossed-off line of any kind, not just a task", () => {
    // an event struck through is as much a thing you did as a task is
    const r = counts([
      page("2026-11-02", [line("a", "guitar", { kind: "event" })]),
      page("2026-11-03", [line("b", "guitar", { kind: "note" })]),
    ]);
    expect(r.guitar).toBe(2);
  });

  it("counts the half of a month you got to, not the whole list", () => {
    const r = pairs([
      page("2026-11-02", [
        line("a", "guitar"),
        line("b", "guitar", { struck: false }),
      ]),
      page("2026-11-03", [line("c", "guitar")]),
    ]);
    expect(r.guitar).toBe("2 of 3");
  });

  it("counts a carried task once, however many mornings it moved", () => {
    // every copy of a carried task shares one id; counting rows would
    // score a task dragged through a fortnight a dozen times
    const pages = ["10", "11", "12", "13"].map((d) =>
      page(`2026-11-${d}`, [
        line("one", "studied", {
          struck: d === "13",
          carriedTo: d === "13" ? undefined : `2026-11-${Number(d) + 1}`,
        }),
      ]),
    );
    expect(pairs(pages, {}, 1)).toEqual({ studied: "1 of 1" });
  });

  it("counts a word twice in one line only once", () => {
    expect(
      counts([page("2026-11-02", [line("a", "guitar guitar")])], {}, 1),
    ).toEqual({ guitar: 1 });
  });

  it("keeps the spelling you actually use", () => {
    const r = review(
      [
        page("2026-11-02", [line("a", "Guitar")]),
        page("2026-11-03", [line("b", "Guitar")]),
        page("2026-11-04", [line("c", "guitar")]),
      ],
      {},
      1,
    );
    expect(r.things[0].word).toBe("Guitar");
  });

  it("puts the commonest first", () => {
    const r = review(
      [
        page("2026-11-02", [line("a", "gym"), line("b", "guitar")]),
        page("2026-11-03", [line("c", "gym")]),
        page("2026-11-04", [line("d", "gym")]),
        page("2026-11-05", [line("e", "guitar")]),
      ],
      {},
      1,
    );
    expect(r.things.map((t) => [t.word, t.done])).toEqual([
      ["gym", 3],
      ["guitar", 2],
    ]);
  });
});

describe("what it leaves out", () => {
  it("drops the words that say nothing about what you did", () => {
    const r = counts(
      [
        page("2026-11-02", [line("a", "go to the gym today")]),
        page("2026-11-03", [line("b", "need to go to the gym again")]),
      ],
      {},
      1,
    );
    expect(Object.keys(r)).toEqual(["gym"]);
  });

  it("drops bare numbers and very short words", () => {
    const r = counts(
      [page("2026-11-02", [line("a", "gym x3 at 7 for 45")])],
      {},
      1,
    );
    expect(Object.keys(r)).toEqual(["gym"]);
  });

  it("keeps what carries the meaning in “3d art”", () => {
    const r = counts(
      [
        page("2026-11-02", [line("a", "3d art")]),
        page("2026-11-03", [line("b", "more 3d art")]),
      ],
      {},
      1,
    );
    expect(r.art).toBe(2);
  });

  it("ignores other months, deleted lines and breadcrumbs", () => {
    const r = counts(
      [
        page("2026-10-31", [line("a", "guitar")]),
        page("2026-12-01", [line("b", "guitar")]),
        page("2026-11-02", [line("c", "guitar", { deletedAt: 1 })]),
        page("2026-11-03", [line("d", "guitar", { carriedTo: "2026-11-04" })]),
        page("2026-11-04", [line("d", "guitar")]),
      ],
      {},
      1,
    );
    expect(r.guitar).toBe(1);
  });

  it("stays quiet about a one-off", () => {
    const r = review([
      page("2026-11-02", [line("a", "guitar"), line("b", "dentist")]),
      page("2026-11-03", [line("c", "guitar")]),
    ]);
    expect(r.things.map((t) => t.word)).toEqual(["guitar"]);
  });

  it("says so when there is nothing to say", () => {
    expect(review([]).things).toEqual([]);
    expect(review([]).written).toBe(0);
    expect(review([page("2026-11-02", [line("a", "   ")])]).written).toBe(0);
  });

  it("knows how much was written, for telling the empty months apart", () => {
    const r = review([
      page("2026-11-02", [line("a", "guitar", { struck: false })]),
      page("2026-11-03", [line("b", "dentist", { struck: false })]),
    ]);
    expect(r.written).toBe(2);
    expect(r.things).toEqual([]); // neither came up twice
  });

  it("shows every thing a real month has in it, not a screenful", () => {
    // the list used to stop at sixteen, which read as the page being
    // broken: "I can't see anything below Praktikum". It scrolls now.
    const pages = Array.from({ length: 24 }, (_, i) =>
      page(`2026-11-${`${(i % 28) + 1}`.padStart(2, "0")}`, [
        line(`l${i}`, `thing${i % 24}`),
        line(`m${i}`, `thing${i % 24}`),
      ]),
    );
    expect(review(pages).things).toHaveLength(24);
  });

  it("has a ceiling, so a pathological notebook can't render forever", () => {
    const pages = Array.from({ length: 120 }, (_, i) =>
      page(`2026-11-${`${(i % 28) + 1}`.padStart(2, "0")}`, [
        line(`l${i}`, `thing${i % 120}`),
      ]),
    );
    expect(review(pages, {}, 1).things).toHaveLength(50);
  });
});

describe("things written as more than one word", () => {
  it("is one row, named by the line, not a row per word", () => {
    // "clean 3" and "kitchen 3" on two rows reads as the page being broken
    const r = review(
      ["02", "03", "04"].map((d) =>
        page(`2026-11-${d}`, [line(`k${d}`, "clean the kitchen")]),
      ),
      {},
      1,
    );
    expect(r.things).toHaveLength(1);
    expect(r.things[0]).toMatchObject({
      word: "clean the kitchen",
      done: 3,
      written: 3,
    });
  });

  it("keeps the wider word and drops its qualifier", () => {
    // "practice" only ever turns up inside "guitar practice", so a row for
    // it under the guitar row counts the same evenings again, vaguer
    const r = review(
      [
        page("2026-11-02", [line("a", "guitar")]),
        page("2026-11-03", [line("b", "guitar practice")]),
        page("2026-11-04", [line("c", "guitar")]),
      ],
      {},
      1,
    );
    expect(r.things.map((t) => [t.word.toLowerCase(), t.done])).toEqual([
      ["guitar", 3],
    ]);
  });

  it("keeps two words that each stand on their own", () => {
    const r = review(
      [
        page("2026-11-02", [line("a", "gym")]),
        page("2026-11-03", [line("b", "gym and guitar")]),
        page("2026-11-04", [line("c", "guitar")]),
      ],
      {},
      1,
    );
    expect(r.things.map((t) => t.word).sort()).toEqual(["guitar", "gym"]);
  });

  it("still finds a drawing for the merged thing", () => {
    const r = review(
      ["02", "03"].map((d) =>
        page(`2026-11-${d}`, [line(`g${d}`, "gym session")]),
      ),
      {},
      1,
    );
    expect(r.things[0].word).toBe("gym session");
    expect(r.things[0].icon).toBe("dumbbell");
  });
});

describe("the drawing beside each one", () => {
  it("comes along when the word has one", () => {
    const r = review(
      [
        page("2026-11-02", [line("a", "gym")]),
        page("2026-11-03", [line("b", "gym")]),
      ],
      {},
      1,
    );
    expect(r.things[0].icon).toBe("dumbbell");
  });

  it("is simply absent when it doesn't", () => {
    const r = review([page("2026-11-02", [line("a", "qutabxane")])], {}, 1);
    expect(r.things[0].icon).toBeNull();
  });

  it("respects what the notebook has been taught", () => {
    const r = review(
      [page("2026-11-02", [line("a", "qutabxane")])],
      { qutabxane: "book" as const },
      1,
    );
    expect(r.things[0].icon).toBe("book");
  });

  it("counts two things that share a drawing separately", () => {
    // the whole reason this counts words rather than drawings: studying
    // and reading both draw a book, and they are not the same thing
    const r = review(
      [
        page("2026-11-02", [line("a", "study"), line("b", "read")]),
        page("2026-11-03", [line("c", "study"), line("d", "read")]),
      ],
      {},
      1,
    );
    expect(r.things.map((t) => t.word).sort()).toEqual(["read", "study"]);
  });
});

describe("the list is yours to keep", () => {
  const month = [
    page("2026-11-02", [line("a", "guitar"), line("b", "add excel")]),
    page("2026-11-03", [line("c", "guitar"), line("d", "add excel")]),
  ];

  it("removes a thing, and keeps it removed", () => {
    // the row stands for both its words, and the button hides all of
    // them — hiding one would leave the other behind as a stub row
    expect(review(month).things.map((t) => t.word)).toContain("add excel");
    const after = reviewMonth(month, "2026-11-01", {}, 2, {
      add: { hidden: true },
      excel: { hidden: true },
    });
    expect(after.things.map((t) => t.word)).toEqual(["guitar"]);
  });

  it("removes it from every other month too, not just this one", () => {
    // the hiding is keyed on the word, so it holds whatever month the
    // word turns up in and whatever it gets grouped with
    const december = [
      page("2026-12-04", [line("x", "add excel")]),
      page("2026-12-05", [line("y", "add excel")]),
    ];
    const r = reviewMonth(december, "2026-12-01", {}, 2, {
      add: { hidden: true },
      excel: { hidden: true },
    });
    expect(r.things).toEqual([]);
  });

  it("knows which words a row stands for, so a removal can name them", () => {
    const r = review(
      ["02", "03"].map((d) =>
        page(`2026-11-${d}`, [line(`k${d}`, "clean the kitchen")]),
      ),
      {},
      1,
    );
    expect(r.things[0].words.sort()).toEqual(["clean", "kitchen"]);
  });

  it("shows something you asked to watch, however rarely it comes up", () => {
    const once = [page("2026-11-02", [line("a", "pottery")])];
    expect(review(once).things).toEqual([]);
    const watched = reviewMonth(once, "2026-11-01", {}, 2, {
      pottery: { tracked: true },
    });
    expect(watched.things.map((t) => [t.word, t.done])).toEqual([
      ["pottery", 1],
    ]);
  });

  it("shows it even in a month it never came up at all", () => {
    // an empty row is the honest answer to "how often did I do this"; a
    // thing that silently vanished would look like a bug
    const r = reviewMonth([], "2026-11-01", {}, 2, {
      pottery: { tracked: true },
    });
    expect(r.things).toEqual([
      { word: "pottery", words: ["pottery"], done: 0, written: 0, icon: null },
    ]);
  });

  it("does not resurrect something tracked and then removed", () => {
    const r = reviewMonth([], "2026-11-01", {}, 2, {
      pottery: { tracked: true, hidden: true },
    });
    expect(r.things).toEqual([]);
  });

  it("calls a thing what you called it", () => {
    const r = reviewMonth(month, "2026-11-01", {}, 2, {
      excel: { label: "Spreadsheets" },
    });
    // a name on any of the row's words names the row
    expect(r.things.map((t) => t.word).sort()).toEqual([
      "Spreadsheets",
      "guitar",
    ]);
    // renaming does not change what it counts
    expect(r.things.find((t) => t.word === "Spreadsheets")?.done).toBe(2);
  });
});
