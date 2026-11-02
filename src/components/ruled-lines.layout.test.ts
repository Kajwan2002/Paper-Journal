import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** A line's row is a grid, and the things on the right of it — the
 *  schedule chip and the ⋯ tools — have to be placed into tracks.
 *
 *  They were once placed by number, and the numbers silently became the
 *  wrong cells the moment a track was inserted in front of them: the chip
 *  landed on top of the writing, grid pushed it onto an implicit second
 *  row, and every line carrying a deadline became two lines tall. It
 *  looked like a width problem and wasn't one.
 *
 *  Nothing here can test layout — there is no browser in this suite — but
 *  it can hold the rule that made the bug possible: place by name, and
 *  only by a name the template actually defines. */

const css = readFileSync(new URL("./ruled-lines.css", import.meta.url), "utf8");

function rowTemplate(): string {
  const block = /\.ruled__row\s*\{([\s\S]*?)\}/.exec(css);
  expect(block, "the row rule should exist").not.toBeNull();
  const template = /grid-template-columns:([\s\S]*?);/.exec(block![1]);
  expect(template, "the row should define its tracks").not.toBeNull();
  return template![1];
}

describe("the line row's grid", () => {
  it("names every track it defines", () => {
    const names = [...rowTemplate().matchAll(/\[([\w-]+)\]/g)].map((m) => m[1]);
    expect(names).toEqual(["glyph", "drawing", "text", "chip", "tools"]);
  });

  it("places everything by name, never by number", () => {
    const placements = [...css.matchAll(/grid-column:\s*([^;]+);/g)].map((m) =>
      m[1].trim(),
    );
    expect(placements.length).toBeGreaterThan(0);
    for (const place of placements) {
      expect(
        place,
        `"grid-column: ${place}" is a bare number — inserting a track ahead of it silently moves it to the wrong cell`,
      ).not.toMatch(/^-?\d/);
    }
  });

  it("only places into tracks that exist", () => {
    const names = new Set(
      [...rowTemplate().matchAll(/\[([\w-]+)\]/g)].map((m) => m[1]),
    );
    for (const m of css.matchAll(/grid-column:\s*([\w-]+)\s*;/g)) {
      expect(names, `no track is named "${m[1]}"`).toContain(m[1]);
    }
  });
});
