import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  diffDays,
  lastYear,
  monthGrid,
  nextWeekday,
  ordinalDay,
  relativeDay,
  toDayKey,
} from "@/lib/date";

describe("ordinalDay", () => {
  it("counts from 1 on new year's day", () => {
    expect(ordinalDay("2026-01-01")).toBe(1);
  });

  it("does not lose a day across a spring DST transition", () => {
    // Europe/London springs forward on 2026-03-29. Flooring the millisecond
    // difference made every page after it a day short.
    expect(ordinalDay("2026-03-30")).toBe(89);
    expect(ordinalDay("2026-07-01")).toBe(182);
    expect(ordinalDay("2026-12-31")).toBe(365);
  });

  it("handles a leap year", () => {
    expect(ordinalDay("2028-12-31")).toBe(366);
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("round-trips", () => {
    expect(addDays(addDays("2026-06-15", 40), -40)).toBe("2026-06-15");
  });
});

describe("diffDays", () => {
  it("is whole across a DST change", () => {
    expect(diffDays("2026-03-01", "2026-04-01")).toBe(31);
  });
});

describe("addMonths", () => {
  it("clamps a short month the way Date does", () => {
    // 31 Jan + 1 month has no 31 Feb; Date rolls it into March.
    expect(addMonths("2026-01-31", 1)).toBe("2026-03-03");
  });
});

describe("nextWeekday", () => {
  it("always lands strictly in the future", () => {
    // 2026-09-10 is a Thursday (4).
    expect(nextWeekday("2026-09-10", 5)).toBe("2026-09-11");
    expect(nextWeekday("2026-09-10", 4)).toBe("2026-09-17");
    expect(nextWeekday("2026-09-10", 1)).toBe("2026-09-14");
  });
});

describe("lastYear", () => {
  it("steps back a year", () => {
    expect(lastYear("2026-09-10")).toBe("2025-09-10");
  });

  it("falls back to 28 Feb from a leap day", () => {
    expect(lastYear("2028-02-29")).toBe("2027-02-28");
  });
});

describe("relativeDay", () => {
  it("names the near days", () => {
    expect(relativeDay("2026-09-10", "2026-09-10")).toBe("today");
    expect(relativeDay("2026-09-11", "2026-09-10")).toBe("tomorrow");
    expect(relativeDay("2026-09-09", "2026-09-10")).toBe("yesterday");
    expect(relativeDay("2026-09-14", "2026-09-10")).toBe("Monday");
    expect(relativeDay("2026-11-02", "2026-09-10")).toBe("2 Nov");
  });
});

describe("monthGrid", () => {
  it("is six Sunday-first weeks around the month", () => {
    const grid = monthGrid("2026-09-15");
    expect(grid).toHaveLength(42);
    expect(new Date(grid[0] + "T00:00:00").getDay()).toBe(0);
    expect(grid).toContain("2026-09-01");
    expect(grid).toContain("2026-09-30");
    // and it spills into the neighbouring months, which is why the
    // month-jump dots have to be loaded for the grid, not the month
    expect(grid[0] < "2026-09-01").toBe(true);
    expect(grid[41] > "2026-09-30").toBe(true);
  });
});

describe("toDayKey", () => {
  it("uses local time, not UTC", () => {
    const late = new Date(2026, 8, 10, 23, 30);
    expect(toDayKey(late)).toBe("2026-09-10");
  });
});
