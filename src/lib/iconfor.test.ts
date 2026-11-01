import { describe, expect, it } from "vitest";
import { cleanLearned, iconFor, wordToLearn } from "@/lib/iconfor";
import { ICON_IDS, ICONS } from "@/lib/icons";

describe("what the notebook draws", () => {
  it("recognises the obvious things", () => {
    expect(iconFor("gym")).toBe("dumbbell");
    expect(iconFor("shower")).toBe("shower");
    expect(iconFor("shave face")).toBe("razor");
    expect(iconFor("study for the exam")).toBe("study");
    expect(iconFor("read a book")).toBe("book");
  });

  it("doesn't care about case or punctuation", () => {
    expect(iconFor("GYM!")).toBe("dumbbell");
    expect(iconFor("  Coffee, with Sara  ")).toBe("coffee");
    expect(iconFor("call mum — important")).toBe("call");
  });

  it("matches whole words, never fragments", () => {
    // the failure this guards: "scatter" containing "cat", "program"
    // containing "ram", and the page filling up with nonsense
    expect(iconFor("scattered thoughts")).toBeNull();
    expect(iconFor("workaround")).toBeNull();
    expect(iconFor("rundown of the quarter")).toBeNull();
    expect(iconFor("cattle")).toBeNull();
    // but the real word, separated by anything at all, still lands
    expect(iconFor("run.")).toBe("run");
    expect(iconFor("gym/shower")).not.toBeNull();
  });

  it("prefers the longer phrase", () => {
    expect(iconFor("walk the dog")).toBe("pet");
    expect(iconFor("walk to town")).toBe("walk");
  });

  it("picks the most specific word, not the first one", () => {
    // "book flights" drew a book until this rule existed, which is the
    // kind of wrong guess that makes the whole feature feel stupid
    expect(iconFor("book flights")).toBe("flight");
    expect(iconFor("read a book")).toBe("book");
    expect(iconFor("book a doctor appointment")).toBe("health");
    expect(iconFor("pay the rent")).toBe("money");
  });

  it("treats a plain plural as the same word", () => {
    expect(iconFor("flights")).toBe("flight");
    expect(iconFor("book flights")).toBe("flight");
    expect(iconFor("two meetings")).toBe("people");
    // and does not mangle words that merely end in s
    expect(iconFor("bus")).toBe("train");
    expect(iconFor("dishes")).toBe("clean");
  });

  it("draws nothing far more often than it draws something", () => {
    // the real risk is wallpaper: an icon on every line is an icon on none
    const ordinary = [
      "think about the thing",
      "ask him again",
      "it went fine",
      "maybe next time",
      "sort that out",
      "wasn't great",
      "much better today",
      "remember to be patient",
    ];
    for (const line of ordinary) expect(iconFor(line)).toBeNull();
  });

  it("is silent on an empty line", () => {
    expect(iconFor("")).toBeNull();
    expect(iconFor("   ")).toBeNull();
  });
});

describe("being taught", () => {
  it("takes a word it had no idea about", () => {
    expect(iconFor("padel with Ali")).toBe("racket"); // already known
    expect(iconFor("qutabxane")).toBeNull();
    expect(iconFor("qutabxane", { qutabxane: "book" })).toBe("book");
  });

  it("overrules a guess it got wrong", () => {
    expect(iconFor("match")).toBe("ball");
    expect(iconFor("match", { match: "film" })).toBe("film");
  });

  it("can be taught to draw nothing, and stays quiet", () => {
    expect(iconFor("coffee")).toBe("coffee");
    expect(iconFor("coffee", { coffee: null })).toBeNull();
  });

  it("stops at the first word it has been taught about", () => {
    // clearing the icon on "gym run" must actually clear it, not fall
    // through and swap in a different drawing
    expect(iconFor("gym run", { gym: null })).toBeNull();
  });

  it("picks the word that makes the line what it is", () => {
    expect(wordToLearn("book the padel court")).toBe("padel");
    expect(wordToLearn("go to the gym")).toBe("gym");
    expect(wordToLearn("finish it today")).toBeNull();
    expect(wordToLearn("")).toBeNull();
  });
});

describe("what arrives from the other device", () => {
  it("keeps what it understands and drops what it doesn't", () => {
    expect(
      cleanLearned({
        gym: "dumbbell",
        quiet: null,
        bogus: "not-an-icon",
        weird: 42,
        "": "book",
      }),
    ).toEqual({ gym: "dumbbell", quiet: null });
  });

  it("survives rubbish", () => {
    expect(cleanLearned(null)).toEqual({});
    expect(cleanLearned("nope")).toEqual({});
    expect(cleanLearned(7)).toEqual({});
  });
});

describe("the drawings themselves", () => {
  it("are all stroked line art with no fills or colour", () => {
    for (const id of ICON_IDS) {
      const paths = ICONS[id] as readonly string[];
      expect(paths.length, id).toBeGreaterThan(0);
      for (const d of paths) {
        expect(d, `${id} path`).toMatch(/^[Mm]/);
        expect(d, `${id} must not carry its own colour`).not.toMatch(
          /fill|stroke|#/,
        );
      }
    }
  });

  it("stay inside the 24×24 box they are drawn in", () => {
    for (const id of ICON_IDS) {
      for (const d of ICONS[id] as readonly string[]) {
        for (const n of d.match(/-?\d+(\.\d+)?/g) ?? []) {
          expect(
            Math.abs(Number(n)),
            `${id} has a number off the grid`,
          ).toBeLessThanOrEqual(24);
        }
      }
    }
  });

  it("are every icon the dictionary promises", () => {
    // a dictionary entry pointing at an icon that doesn't exist renders a
    // hole, and only on the one line unlucky enough to say that word
    const used = new Set<string>();
    for (const line of [
      "gym",
      "run",
      "bike",
      "swim",
      "walk",
      "football",
      "padel",
      "shower",
      "shave",
      "teeth",
      "haircut",
      "lunch",
      "coffee",
      "groceries",
      "water",
      "read",
      "study",
      "write",
      "code",
      "work",
      "email",
      "call",
      "pay",
      "tax",
      "medicine",
      "doctor",
      "clean",
      "laundry",
      "bins",
      "fix",
      "plants",
      "home",
      "car",
      "flight",
      "bus",
      "meet",
      "birthday",
      "gift",
      "music",
      "film",
      "game",
      "dog",
      "sleep",
      "photo",
      "keys",
      "meeting",
    ]) {
      const hit = iconFor(line);
      expect(hit, `"${line}" should name a drawing`).not.toBeNull();
      used.add(hit!);
    }
    for (const id of used) expect(ICON_IDS).toContain(id);
  });
});
