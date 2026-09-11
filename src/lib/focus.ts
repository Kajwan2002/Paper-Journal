/** The week's focus points — a few free-text lines you jot once, that sit
 *  next to every day that week while you plan it. Not part of the rapid-log
 *  grammar: no kind, no schedule, nothing that rolls over or nags.
 *
 *  A focus line can optionally end in "x3" (or "×3") to name how many times
 *  a week — "Gym x3". That's the only setup there is: no habit object to
 *  create, no category to pick. The tally beside it just counts how many
 *  things you finished *this week* share a word with it. It is a fact, not
 *  a grade — there is no failure state, nothing turns red, and a week you
 *  didn't touch it just quietly becomes last week. */

import {
  getPage,
  getWeekNote,
  pageId,
  saveWeekNote,
  type FocusLine,
} from "@/lib/db";
import { startOfWeek, weekDays, type DayKey } from "@/lib/date";
import { getCached, notifyJournal } from "@/lib/pageStore";
import { isStruck } from "@/lib/rapidlog";
import { newId } from "@/lib/id";

export type { FocusLine };

export interface FocusRow extends FocusLine {
  /** the line with a trailing "x3" stripped, for display */
  label: string;
  /** how many times a week this was written for, if it was */
  target?: number;
  /** finished lines this week that shared a word with this focus */
  count: number;
}

const TARGET_RE = /\s*[x×]\s*(\d{1,2})\s*$/i;

// words too common to mean anything as a match
const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "week",
  "weeks",
  "focus",
  "a",
  "an",
  "to",
  "of",
  "on",
  "in",
  "my",
  "at",
  "is",
  "are",
  "was",
  "were",
  "be",
  "not",
  "per",
  "day",
  "days",
  "time",
  "times",
]);

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function keywordsOf(label: string): string[] {
  return wordsOf(label).filter(
    (w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w),
  );
}

export function newFocusLine(text = ""): FocusLine {
  return { id: newId(), text };
}

export async function loadFocusLines(
  notebookId: string,
  date: DayKey,
): Promise<FocusLine[]> {
  const note = await getWeekNote(notebookId, startOfWeek(date));
  return note?.lines ?? [];
}

export async function saveFocusLines(
  notebookId: string,
  date: DayKey,
  lines: FocusLine[],
): Promise<void> {
  await saveWeekNote(notebookId, startOfWeek(date), lines);
  notifyJournal();
}

/** This week's focus lines, each with a tally of how many things you
 *  finished this week (on any day of it) share a word with it. */
export async function focusRows(
  notebookId: string,
  date: DayKey,
): Promise<FocusRow[]> {
  const weekStart = startOfWeek(date);
  const note = await getWeekNote(notebookId, weekStart);
  const lines = note?.lines ?? [];
  if (lines.length === 0) return [];

  const finished: string[][] = [];
  for (const day of weekDays(weekStart)) {
    const stored =
      getCached(pageId(notebookId, day)) ??
      (await getPage(notebookId, day))?.lines ??
      [];
    for (const line of stored) {
      if (isStruck(line) && line.text.trim()) finished.push(wordsOf(line.text));
    }
  }

  return lines.map((line) => {
    const match = line.text.match(TARGET_RE);
    const target = match ? Number(match[1]) : undefined;
    const label = line.text.replace(TARGET_RE, "").trim();
    const keywords = keywordsOf(label);
    const count =
      keywords.length === 0
        ? 0
        : finished.filter((words) => keywords.some((k) => words.includes(k)))
            .length;
    return { ...line, label, target, count };
  });
}
