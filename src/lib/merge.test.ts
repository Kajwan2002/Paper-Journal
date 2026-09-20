import { describe, expect, it } from "vitest";
import {
  living,
  mergeLines,
  stampEdits,
  withOrder,
  withTombstones,
} from "@/lib/merge";
import { newLine, reorderGroup, type Line } from "@/lib/rapidlog";

const at = (line: Line, editedAt: number): Line => ({ ...line, editedAt });

/** What a page write does to the lines on their way to storage. */
const written = (next: Line[], previous: Line[], now: number) =>
  withOrder(stampEdits(next, previous, now), now);

describe("mergeLines", () => {
  it("keeps a line only one device has", () => {
    const mine = [at(newLine("task", "mine"), 10)];
    const theirs = [at(newLine("task", "theirs"), 10)];
    expect(mergeLines(mine, theirs).map((l) => l.text)).toEqual([
      "mine",
      "theirs",
    ]);
  });

  it("takes the later edit when both touched the same line", () => {
    const base = newLine("task", "original");
    const mine = [{ ...base, text: "edited on the pc", editedAt: 20 }];
    const theirs = [{ ...base, text: "edited on the phone", editedAt: 30 }];
    expect(mergeLines(mine, theirs)[0].text).toBe("edited on the phone");
    expect(mergeLines(theirs, mine)[0].text).toBe("edited on the phone");
  });

  it("lets a later edit beat an earlier delete — writing is never lost", () => {
    const base = newLine("task", "still wanted");
    const deleted = [{ ...base, text: "", deletedAt: 20 }];
    const edited = [{ ...base, text: "still wanted", editedAt: 40 }];
    expect(living(mergeLines(deleted, edited))).toHaveLength(1);
    expect(living(mergeLines(edited, deleted))).toHaveLength(1);
  });

  it("lets a later delete beat an earlier edit", () => {
    const base = newLine("task", "gone");
    const edited = [{ ...base, editedAt: 10 }];
    const deleted = [{ ...base, text: "", deletedAt: 50 }];
    expect(living(mergeLines(edited, deleted))).toHaveLength(0);
  });

  it("reaches the same answer whichever device merges", () => {
    const a = newLine("task", "a");
    const b = newLine("task", "b");
    const mine = [at(a, 5), at(b, 9)];
    const theirs = [{ ...b, text: "b edited", editedAt: 12 }];
    const one = mergeLines(mine, theirs)
      .map((l) => l.text)
      .sort();
    const two = mergeLines(theirs, mine)
      .map((l) => l.text)
      .sort();
    expect(one).toEqual(two);
  });

  it("treats an unstamped line as older than any stamped one", () => {
    const base = newLine("task", "old shape");
    const legacy = [{ ...base }]; // written before sync existed
    const fresh = [{ ...base, text: "edited since", editedAt: 1 }];
    expect(mergeLines(legacy, fresh)[0].text).toBe("edited since");
  });

  it("does not reshuffle the page under the reader", () => {
    const [a, b, c] = ["a", "b", "c"].map((t) => at(newLine("task", t), 1));
    expect(mergeLines([a, b, c], [c, a, b]).map((l) => l.text)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("carries a real reorder across a sync — the whole point of `order`", () => {
    // regression: "the order of things doesn't get synced if i move a task
    // up or down". mine is a device that never touched this page; theirs
    // dragged "c" up above "a" — simulated the way it actually happens,
    // reorderGroup followed by the same write a real drag goes through.
    const mine = written(
      ["a", "b", "c"].map((t) => newLine("task", t)),
      [],
      10,
    );
    const theirs = written(reorderGroup(mine, 2, 0), mine, 100);
    expect(mergeLines(mine, theirs).map((l) => l.text)).toEqual([
      "c",
      "a",
      "b",
    ]);
    // and the other way around — whichever device pulls reaches the same page
    expect(mergeLines(theirs, mine).map((l) => l.text)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("carries a whole dragged group across a sync, still in one piece", () => {
    const mine = written(
      [
        newLine("task", "DM Shopping"),
        newLine("note", "Pads", 1),
        newLine("note", "Hangers", 1),
        newLine("task", "Breakfast"),
        newLine("task", "Work"),
      ],
      [],
      10,
    );
    // the other device drags the shopping list down below "Work"
    const theirs = written(reorderGroup(mine, 0, 3), mine, 100);
    const landed = ["Breakfast", "Work", "DM Shopping", "Pads", "Hangers"];

    expect(mergeLines(mine, theirs).map((l) => l.text)).toEqual(landed);
    expect(mergeLines(theirs, mine).map((l) => l.text)).toEqual(landed);
  });

  it("a plain edit elsewhere on the page survives a concurrent reorder", () => {
    // moving "c" must not touch "b" at all — an untouched line keeps
    // whatever edit it was carrying, reorder or not
    const [a, b, c] = ["a", "b", "c"].map((t) => newLine("task", t));
    const mine = [a, { ...b, text: "b edited", editedAt: 50 }, c];
    const theirs = stampEdits(reorderGroup([a, b, c], 2, 0), [a, b, c], 10);
    const merged = mergeLines(mine, theirs);
    expect(merged.find((l) => l.id === b.id)?.text).toBe("b edited");
  });

  it("a freshly typed line doesn't get outranked by an old migrated one", () => {
    // regression: "when I add something on PC anywhere, doesn't matter,
    // after a few seconds it moves it all the way to the top" — a carried
    // task used to be stamped with a fresh Date.now()-scale `order`, which
    // dwarfs the array-index scale a page sorts by without one. Once a page
    // had any migrated tasks on it (the common case — rollover runs every
    // day), every new line landed above all of them on the next sync.
    const breakfast = newLine("event", "Breakfast");
    const work = newLine("event", "Work");
    // a migrated task, the way rollover leaves it once fixed — no order
    const csLesson = { ...newLine("migrated", "CS Lesson") };
    const art = newLine("task", "3D Art");
    const mine = [breakfast, work, csLesson, art];
    const theirs = mine;

    const guitar = newLine("task", "Practice Guitar");
    const mineWithNew = stampEdits([...mine, guitar], mine, Date.now());

    expect(mergeLines(mineWithNew, theirs).map((l) => l.text)).toEqual([
      "Breakfast",
      "Work",
      "CS Lesson",
      "3D Art",
      "Practice Guitar",
    ]);
  });
});

describe("withTombstones", () => {
  it("records what disappeared, with no text on the marker", () => {
    const a = newLine("task", "kept");
    const b = newLine("task", "removed");
    const out = withTombstones([a], [a, b], 99);
    expect(out).toHaveLength(2);
    const grave = out.find((l) => l.id === b.id)!;
    expect(grave.deletedAt).toBe(99);
    expect(grave.text).toBe("");
    expect(living(out).map((l) => l.text)).toEqual(["kept"]);
  });

  it("does nothing when nothing was removed", () => {
    const a = newLine("task", "kept");
    expect(withTombstones([a], [a], 99)).toHaveLength(1);
  });
});

describe("withOrder", () => {
  it("gives every line a position, in the order they sit in", () => {
    const out = withOrder(
      ["a", "b", "c"].map((t) => newLine("task", t)),
      5,
    );
    const orders = out.map((l) => l.order!);
    expect(orders.every((o) => typeof o === "number")).toBe(true);
    expect([...orders].sort((x, y) => x - y)).toEqual(orders);
    expect(out.every((l) => l.orderedAt === 5)).toBe(true);
  });

  it("fits a new line between the two it was written between", () => {
    const [a, c] = [newLine("task", "a"), newLine("task", "c")];
    const placed = withOrder([a, c], 5);
    const b = newLine("task", "b");
    const out = withOrder([placed[0], b, placed[1]], 9);
    expect(out[1].order!).toBeGreaterThan(out[0].order!);
    expect(out[1].order!).toBeLessThan(out[2].order!);
  });

  it("leaves a line that already has a position exactly where it was", () => {
    const placed = withOrder(
      ["a", "b"].map((t) => newLine("task", t)),
      5,
    );
    const again = withOrder(placed, 99);
    expect(again).toBe(placed); // nothing to do, so nothing is rewritten
  });
});

describe("stampEdits", () => {
  it("stamps only what changed", () => {
    const a = newLine("task", "untouched");
    const b = newLine("task", "before");
    const out = stampEdits([a, { ...b, text: "after" }], [a, b], 77);
    expect(out[0].editedAt).toBeUndefined();
    expect(out[1].editedAt).toBe(77);
  });

  it("stamps a line that was only struck", () => {
    const a = newLine("task", "same text");
    const out = stampEdits([{ ...a, struck: true }], [a], 77);
    expect(out[0].editedAt).toBe(77);
  });

  it("stamps a brand new line", () => {
    const out = stampEdits([newLine("task", "new")], [], 77);
    expect(out[0].editedAt).toBe(77);
  });
});
