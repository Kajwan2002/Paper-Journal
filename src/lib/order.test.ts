import { describe, expect, it } from "vitest";
import {
  living,
  mergeLines,
  stampEdits,
  withOrder,
  withTombstones,
} from "@/lib/merge";
import { newLine, reorderGroup, type Line } from "@/lib/rapidlog";

/** The page as it is actually stored: living lines plus tombstones. */
interface Page {
  lines: Line[];
  clock: number;
}

const texts = (lines: Line[]) =>
  living(lines)
    .map((l) => l.text)
    .join(" ");

/** One write, exactly the way `pageStore.writeLines` does it. */
function write(page: Page, next: Line[]): Page {
  const prev = living(page.lines);
  const now = page.clock;
  const stamped = withOrder(stampEdits(next, prev, now), now);
  const graves = page.lines.filter((l) => l.deletedAt);
  return {
    lines: [...withTombstones(stamped, prev, now), ...graves],
    clock: now + 1,
  };
}

/** A page nobody has touched yet, written once so it has positions. */
function start(n: number): Page {
  const lines = Array.from({ length: n }, (_, i) =>
    newLine("task", String.fromCharCode(65 + i)),
  );
  return write({ lines: [], clock: 10 }, lines);
}

describe("a merge against a stale copy", () => {
  // The bug this guards: "the sync feature still sometimes moves things
  // around randomly a few sec after adding them". A pull merges what's on
  // this device against what the gist still holds, which is always at least
  // one edit behind — so if that merge can reorder anything, the page
  // reshuffles itself seconds after you write on it, for no visible reason.
  it("never reshuffles the page, whatever was done to it", () => {
    let seed = 7;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };

    for (let trial = 0; trial < 500; trial++) {
      let page = start(4);
      let fresh = 0;
      const log: string[] = [];

      for (let step = 0; step < 6; step++) {
        const stale = page.lines; // what the gist still has
        const now = living(page.lines);
        const op = rnd(3);
        if (op === 0 && now.length > 1) {
          const from = rnd(now.length);
          let to = rnd(now.length);
          if (to === from) to = (to + 1) % now.length;
          page = write(page, reorderGroup(now, from, to));
          log.push(`drag ${from}->${to}`);
        } else if (op === 1) {
          page = write(page, [...now, newLine("task", `n${fresh++}`)]);
          log.push("type");
        } else if (now.length > 2) {
          const at = rnd(now.length);
          log.push(`delete ${now[at].text}`);
          page = write(
            page,
            now.filter((_, i) => i !== at),
          );
        } else continue;

        const merged = mergeLines(page.lines, stale);
        expect(texts(merged), `trial ${trial} after ${log.join(", ")}`).toBe(
          texts(page.lines),
        );
      }
    }
  });

  it("reaches the same page whichever device pulls", () => {
    let seed = 99;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };

    for (let trial = 0; trial < 300; trial++) {
      const base = start(5);
      // two devices drift apart from the same page, then meet
      let a = base;
      let b = base;
      for (let step = 0; step < 3; step++) {
        const la = living(a.lines);
        const lb = living(b.lines);
        a =
          rnd(2) === 0
            ? write(a, reorderGroup(la, rnd(la.length), rnd(la.length)))
            : write(a, [...la, newLine("task", `a${step}`)]);
        b =
          rnd(2) === 0
            ? write(b, reorderGroup(lb, rnd(lb.length), rnd(lb.length)))
            : write(b, [...lb, newLine("task", `b${step}`)]);
      }
      expect(texts(mergeLines(a.lines, b.lines))).toBe(
        texts(mergeLines(b.lines, a.lines)),
      );
    }
  });

  it("settles rather than drifting when the same merge runs again", () => {
    let page = start(4);
    const other = page;
    page = write(page, reorderGroup(living(page.lines), 3, 0));
    page = write(page, [...living(page.lines), newLine("task", "fresh")]);

    const once = mergeLines(page.lines, other.lines);
    const twice = mergeLines(once, other.lines);
    expect(texts(twice)).toBe(texts(once));
  });
});

describe("a drag still reaches the other device", () => {
  it("moves the line there too, without touching what it says", () => {
    const base = start(4); // A B C D
    const dragged = write(base, reorderGroup(living(base.lines), 3, 0));
    expect(texts(dragged.lines)).toBe("D A B C");

    // the other device pulls, having done nothing itself
    expect(texts(mergeLines(base.lines, dragged.lines))).toBe("D A B C");
    expect(texts(mergeLines(dragged.lines, base.lines))).toBe("D A B C");
  });

  it("doesn't cost an edit made to the same line somewhere else", () => {
    const base = start(3); // A B C
    // one device drags C to the front; the other retypes it
    const moved = write(base, reorderGroup(living(base.lines), 2, 0));
    const edited = write(
      base,
      living(base.lines).map((l) =>
        l.text === "C" ? { ...l, text: "C rewritten" } : l,
      ),
    );

    for (const merged of [
      mergeLines(moved.lines, edited.lines),
      mergeLines(edited.lines, moved.lines),
    ]) {
      // the move lands and the words survive — they are separate facts
      expect(living(merged).map((l) => l.text)).toEqual([
        "C rewritten",
        "A",
        "B",
      ]);
    }
  });
});
