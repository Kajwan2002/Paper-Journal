import { describe, expect, it } from "vitest";
import { living, mergeLines, stampEdits, withTombstones } from "@/lib/merge";
import { newLine, reorderLine, type Line } from "@/lib/rapidlog";

const at = (line: Line, editedAt: number): Line => ({ ...line, editedAt });

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
    // reorderLine followed by the same stampEdits a real write goes through.
    const [a, b, c] = ["a", "b", "c"].map((t) => newLine("task", t));
    const mine = [a, b, c];
    const theirs = stampEdits(reorderLine(mine, 2, 0), mine, 100);
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

  it("a plain edit elsewhere on the page survives a concurrent reorder", () => {
    // moving "c" must not touch "b" at all — an untouched line keeps
    // whatever edit it was carrying, reorder or not
    const [a, b, c] = ["a", "b", "c"].map((t) => newLine("task", t));
    const mine = [a, { ...b, text: "b edited", editedAt: 50 }, c];
    const theirs = stampEdits(reorderLine([a, b, c], 2, 0), [a, b, c], 10);
    const merged = mergeLines(mine, theirs);
    expect(merged.find((l) => l.id === b.id)?.text).toBe("b edited");
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
