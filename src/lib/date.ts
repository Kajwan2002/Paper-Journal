/** Local-date helpers. A "day key" is an ISO-ish YYYY-MM-DD string in the
 *  user's own timezone — never UTC, so the page you open at 11pm is today. */

export type DayKey = string;

export function toDayKey(d: Date): DayKey {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromDayKey(key: DayKey): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): DayKey {
  return toDayKey(new Date());
}

export function addDays(key: DayKey, delta: number): DayKey {
  const d = fromDayKey(key);
  d.setDate(d.getDate() + delta);
  return toDayKey(d);
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

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function weekday(key: DayKey): string {
  return WEEKDAYS[fromDayKey(key).getDay()];
}

/** e.g. "9 September 2026" */
export function longDate(key: DayKey): string {
  const d = fromDayKey(key);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** e.g. "Sep 2026" */
export function monthLabel(key: DayKey): string {
  const d = fromDayKey(key);
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

/** Day of the year, 1-366 — used as the printed "page number".
 *  Rounded, not floored: a span that crosses a DST change is an hour short
 *  of a whole number of days, and flooring that silently loses a day for
 *  every page after the spring transition. */
export function ordinalDay(key: DayKey): number {
  const d = fromDayKey(key);
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.round((d.getTime() - start.getTime()) / 86_400_000);
}

export function isToday(key: DayKey): boolean {
  return key === todayKey();
}

/** Whole days from `a` to `b` (positive if `b` is later). Rounded, so a long
 *  span that straddles a DST change still comes out whole. */
export function diffDays(a: DayKey, b: DayKey): number {
  return Math.round(
    (fromDayKey(b).getTime() - fromDayKey(a).getTime()) / 86_400_000,
  );
}

export function addMonths(key: DayKey, delta: number): DayKey {
  const d = fromDayKey(key);
  d.setMonth(d.getMonth() + delta);
  return toDayKey(d);
}

export function startOfMonth(key: DayKey): DayKey {
  const d = fromDayKey(key);
  return toDayKey(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function isSameMonth(a: DayKey, b: DayKey): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** e.g. "September 2026" */
export function monthTitle(key: DayKey): string {
  const d = fromDayKey(key);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** 42 day keys — six Sunday-first weeks covering the month `key` falls in,
 *  with leading/trailing spill days from the neighbouring months. */
export function monthGrid(key: DayKey): DayKey[] {
  const first = fromDayKey(startOfMonth(key));
  const start = new Date(first);
  start.setDate(1 - first.getDay()); // back up to the Sunday
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return toDayKey(d);
  });
}

/** e.g. "9 Sep" — for tight spots like the migrate menu. */
export function shortDate(key: DayKey): string {
  const d = fromDayKey(key);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

/** "today" · "tomorrow" · "yesterday" · "Tuesday" (within the week) ·
 *  otherwise a short date. Used wherever a date is read rather than filed. */
export function relativeDay(key: DayKey, from: DayKey = todayKey()): string {
  const delta = diffDays(from, key);
  if (delta === 0) return "today";
  if (delta === 1) return "tomorrow";
  if (delta === -1) return "yesterday";
  if (delta > 1 && delta < 7) return weekday(key);
  if (delta < -1 && delta > -7) return `last ${weekday(key)}`;
  return shortDate(key);
}

/** The same day one year earlier. 29 Feb falls back to 28 Feb. */
export function lastYear(key: DayKey): DayKey {
  const d = fromDayKey(key);
  const target = new Date(d.getFullYear() - 1, d.getMonth(), d.getDate());
  if (target.getMonth() !== d.getMonth()) target.setDate(0); // 29 Feb -> 28 Feb
  return toDayKey(target);
}

/** The next occurrence of a weekday (0 = Sunday), strictly after `from`. */
export function nextWeekday(from: DayKey, dow: number): DayKey {
  const cur = fromDayKey(from).getDay();
  const ahead = (dow - cur + 7) % 7 || 7;
  return addDays(from, ahead);
}

export function endOfMonth(key: DayKey): DayKey {
  const d = fromDayKey(key);
  return toDayKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
