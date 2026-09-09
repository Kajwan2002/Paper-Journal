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

/** Day of the year, 1-366 — used as the printed "page number". */
export function ordinalDay(key: DayKey): number {
  const d = fromDayKey(key);
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
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
