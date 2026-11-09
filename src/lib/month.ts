import type { Page } from "@/lib/db";
import {
  addDays,
  addMonths,
  endOfMonth,
  fromDayKey,
  monthTitle,
  startOfMonth,
  todayKey,
  type DayKey,
} from "@/lib/date";
import { isStruck, isTaskKind, type Line } from "@/lib/rapidlog";
import { iconFor, type Learned } from "@/lib/iconfor";
import type { IconId } from "@/lib/icons";

/** A month, read back.
 *
 *  Not a dashboard. The notebook's one rule is that the page stays analog
 *  and the intelligence lives in the margins, so this counts what is
 *  already written and says a few true things about it — it does not
 *  grade, score, or draw a graph of your life.
 *
 *  Two rules run through all of it.
 *
 *  **Count line ids, never lines.** A task carried forward keeps one id
 *  across every copy of itself, so counting rows would score a task you
 *  dragged through eleven mornings eleven times. This is the same mistake
 *  the weekly tally once made, and it reads as the notebook lying to you.
 *
 *  **Say nothing rather than something shaky.** An observation drawn from
 *  four data points is noise wearing a sentence, and a notebook that
 *  invents patterns is worse than one that says nothing at all. Every
 *  remark below has a floor it will not speak beneath. */

export interface DayInk {
  date: DayKey;
  /** lines with writing on them, which sets how dark the day's mark is */
  written: number;
  /** tasks struck on this day */
  finished: number;
  isToday: boolean;
  /** later than today — nothing to say about it yet */
  future: boolean;
}

export interface Drawing {
  icon: IconId;
  count: number;
}

export interface Clung {
  text: string;
  rolls: number;
}

export interface MonthReview {
  month: DayKey;
  title: string;
  days: DayInk[];
  /** days in the month with anything written on them */
  daysWritten: number;
  /** days in the month that have happened */
  daysSoFar: number;
  /** longest unbroken run of days written */
  streak: number;
  finished: number;
  /** finished last month, for the one comparison worth making */
  finishedBefore: number | null;
  drawings: Drawing[];
  clung: Clung[];
  deadlines: { met: number; missed: number };
  /** a few true sentences, or none */
  remarks: string[];
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Lines that are really there: not tombstones, not breadcrumbs left behind
 *  by a move, not blank. */
function living(page: Page): Line[] {
  return page.lines.filter(
    (l) => !l.deletedAt && !l.carriedTo && l.text.trim().length > 0,
  );
}

function inRange(date: DayKey, from: DayKey, to: DayKey): boolean {
  return date >= from && date <= to;
}

/**
 * Everything the month page shows, from the pages it covers.
 *
 * `pages` may hold more than the month — the grid shows a few days either
 * side — and `before` is the previous month, for the one comparison worth
 * making. Both are filtered here rather than by the caller, so the counts
 * cannot drift from what is drawn.
 */
export function reviewMonth(
  pages: Page[],
  month: DayKey,
  learned: Learned = {},
  before: Page[] = [],
  today: DayKey = todayKey(),
): MonthReview {
  const from = startOfMonth(month);
  const to = endOfMonth(month);
  const byDate = new Map(pages.map((p) => [p.date, p]));

  // --- the grid -------------------------------------------------------
  const days: DayInk[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const page = byDate.get(d);
    const lines = page ? living(page) : [];
    days.push({
      date: d,
      written: lines.length,
      finished: lines.filter((l) => isTaskKind(l) && isStruck(l)).length,
      isToday: d === today,
      future: d > today,
    });
  }

  const past = days.filter((d) => !d.future);
  const daysWritten = past.filter((d) => d.written > 0).length;

  let streak = 0;
  let run = 0;
  for (const d of past) {
    run = d.written > 0 ? run + 1 : 0;
    if (run > streak) streak = run;
  }

  // --- what was finished, counted by task rather than by row ----------
  const finishedIds = new Map<string, DayKey>();
  const drawn = new Map<string, IconId>();
  const clinging = new Map<string, Clung>();
  const deadlines = new Map<string, { by: DayKey; done: boolean }>();

  for (const page of pages) {
    if (!inRange(page.date, from, to)) continue;
    for (const line of living(page)) {
      const task = isTaskKind(line);
      if (task && isStruck(line) && !finishedIds.has(line.id)) {
        finishedIds.set(line.id, page.date);
      }
      const icon = iconFor(line.text, learned);
      if (icon && !drawn.has(line.id)) drawn.set(line.id, icon);
      // one carry is an ordinary morning, not a cost. Two is a pattern.
      if (task && !isStruck(line) && (line.rolls ?? 0) >= 2) {
        const held = clinging.get(line.id);
        if (!held || (line.rolls ?? 0) > held.rolls) {
          clinging.set(line.id, {
            text: line.text.trim(),
            rolls: line.rolls ?? 0,
          });
        }
      }
    }

    // Deadlines are collected from every copy of a line, breadcrumbs
    // included, and belong to the month the deadline falls in rather than
    // the month the page is in.
    //
    // Without the breadcrumbs a missed deadline vanishes from the month it
    // was missed in: the task gets carried into the next month, the copy
    // left behind is a breadcrumb, and the only live copy is on a page
    // this review never loads. The month then reports its met deadlines
    // and quietly forgets the rest, which is the one direction a notebook
    // must not be wrong in.
    for (const line of page.lines) {
      if (line.deletedAt || !line.deadline) continue;
      if (!inRange(line.deadline, from, to)) continue;
      const seen = deadlines.get(line.id);
      deadlines.set(line.id, {
        by: line.deadline,
        done: (seen?.done ?? false) || isStruck(line),
      });
    }
  }

  const counts = new Map<IconId, number>();
  for (const icon of drawn.values()) {
    counts.set(icon, (counts.get(icon) ?? 0) + 1);
  }
  const drawings = [...counts.entries()]
    .map(([icon, count]) => ({ icon, count }))
    .sort((a, b) => b.count - a.count || a.icon.localeCompare(b.icon))
    .slice(0, 8);

  const clung = [...clinging.values()]
    .sort((a, b) => b.rolls - a.rolls || a.text.localeCompare(b.text))
    .slice(0, 3);

  let met = 0;
  let missed = 0;
  for (const d of deadlines.values()) {
    if (d.done) met++;
    else if (d.by < today) missed++;
  }

  // --- last month, for the one comparison worth making ----------------
  const beforeFrom = startOfMonth(addMonths(from, -1));
  const beforeTo = endOfMonth(beforeFrom);
  const beforeIds = new Set<string>();
  let sawBefore = false;
  for (const page of before) {
    if (!inRange(page.date, beforeFrom, beforeTo)) continue;
    sawBefore = true;
    for (const line of living(page)) {
      if (isTaskKind(line) && isStruck(line)) beforeIds.add(line.id);
    }
  }

  const review: MonthReview = {
    month: from,
    title: monthTitle(from),
    days,
    daysWritten,
    daysSoFar: past.length,
    streak,
    finished: finishedIds.size,
    finishedBefore: sawBefore ? beforeIds.size : null,
    drawings,
    clung,
    deadlines: { met, missed },
    remarks: [],
  };
  review.remarks = remarksFor(review, finishedIds);
  return review;
}

/**
 * The few sentences worth saying, each with a floor it will not speak
 * beneath. A notebook that invents a pattern out of four data points is
 * worse than one that says nothing.
 */
function remarksFor(
  review: MonthReview,
  finishedOn: Map<string, DayKey>,
): string[] {
  const out: string[] = [];

  // the day of the week things actually get done — only once there is
  // enough to see a shape, and only if one day genuinely stands out
  if (finishedOn.size >= 12) {
    const perDay = new Array<number>(7).fill(0);
    for (const date of finishedOn.values()) {
      perDay[fromDayKey(date).getDay()]++;
    }
    const best = perDay.indexOf(Math.max(...perDay));
    const mean = finishedOn.size / 7;
    if (perDay[best] >= mean * 1.6) {
      out.push(`You finish most on ${WEEKDAYS[best]}s.`);
    }
  }

  // against last month, only when the gap is big enough not to be noise
  // and only once this month is far enough along to be comparable
  if (
    review.finishedBefore !== null &&
    review.daysSoFar >= 20 &&
    review.finished + review.finishedBefore >= 10
  ) {
    const delta = review.finished - review.finishedBefore;
    if (Math.abs(delta) >= 5) {
      out.push(
        delta > 0
          ? `${delta} more finished than last month.`
          : `${-delta} fewer finished than last month.`,
      );
    }
  }

  if (review.streak >= 7) {
    out.push(`You wrote ${review.streak} days running.`);
  }

  if (review.clung.length > 0 && review.clung[0].rolls >= 5) {
    const { text, rolls } = review.clung[0];
    out.push(`“${text}” has moved ${rolls} mornings.`);
  }

  return out.slice(0, 3);
}
