import { addDays, addMonths, nextWeekday, todayKey, type DayKey } from "@/lib/date";

/** Quiet scheduling: you write "call mum friday" and the notebook files it
 *  for Friday without ever showing you a date picker.
 *
 *  Deliberately conservative. Only a phrase at the *end* of the line counts,
 *  only on a task-ish line, and only when something is left over to be the
 *  task itself — so "friday night lights" and a line that is nothing but
 *  "tomorrow" are both left exactly as typed. Applied when a line is
 *  committed (Enter or blur), never on every keystroke, so the text never
 *  rearranges itself under the cursor. */

const DOW: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

/** Ordered: the first pattern that matches the tail of the line wins. */
const RULES: Array<[RegExp, (m: RegExpMatchArray, on: DayKey) => DayKey]> = [
  [/\btoday\b\s*$/i, (_, on) => on],
  [/\btonight\b\s*$/i, (_, on) => on],
  [/\b(?:tomorrow|tmr|tmrw)\b\s*$/i, (_, on) => addDays(on, 1)],
  [/\bnext\s+week\b\s*$/i, (_, on) => addDays(on, 7)],
  [/\bnext\s+month\b\s*$/i, (_, on) => addMonths(on, 1)],
  [
    /\bin\s+(\d{1,3})\s+(day|days|week|weeks|month|months)\b\s*$/i,
    (m, on) => {
      const n = Number(m[1]);
      const unit = m[2].toLowerCase();
      if (unit.startsWith("month")) return addMonths(on, n);
      return addDays(on, unit.startsWith("week") ? n * 7 : n);
    },
  ],
  [
    new RegExp(`\\b(?:next\\s+)?(${Object.keys(DOW).join("|")})\\b\\s*$`, "i"),
    (m, on) => nextWeekday(on, DOW[m[1].toLowerCase()]),
  ],
];

export interface Scheduled {
  text: string;
  due?: DayKey;
}

/** Pull a trailing date phrase off a line. Returns the text unchanged (and
 *  no `due`) when there is nothing to find. */
export function parseDue(raw: string, on: DayKey = todayKey()): Scheduled {
  const text = raw.replace(/\s+$/, "");
  for (const [re, resolve] of RULES) {
    const m = text.match(re);
    if (!m) continue;
    const rest = text.slice(0, m.index).replace(/[\s,·-]+$/, "");
    // the phrase has to be qualifying something — a bare "tomorrow" is a note
    if (rest.trim().length === 0) return { text };
    return { text: rest, due: resolve(m, on) };
  }
  return { text };
}
