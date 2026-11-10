import type { Page } from "@/lib/db";
import { endOfMonth, monthTitle, startOfMonth, type DayKey } from "@/lib/date";
import { isStruck, type Line } from "@/lib/rapidlog";
import { iconFor, type Learned } from "@/lib/iconfor";
import type { IconId } from "@/lib/icons";

/** A month, counted.
 *
 *  One question: how many times did I do each thing. Not how many days
 *  were productive, not what share got ticked — a journal is not a
 *  scoreboard, and a page that grades the month is a page you stop
 *  opening. The first version of this counted finished days and was
 *  rightly thrown out.
 *
 *  Each thing carries both numbers: how many times it was crossed off,
 *  and how many times it was written down at all. The strike is the one
 *  unambiguous mark meaning "this happened", so it leads — but a thing
 *  written eight times and never struck is worth seeing too, and a
 *  notebook kept as a log would otherwise read as an empty month. Two
 *  numbers mean the page is true however it is kept.
 *
 *  Counting is by **word**, not by the margin drawing, because the
 *  drawings deliberately lump things together: studying, reading and a
 *  lecture all draw a book, and "3d art" draws nothing at all. The word is
 *  what makes a thing the thing it is. It is also the rule the weekly
 *  focus tally already uses, so "Gym x3" there and "gym · 11" here mean
 *  the same thing by the same method.
 *
 *  Each thing is counted once per line, by line id: a task carried through
 *  eleven mornings is one thing you wrote down, not eleven. */

export interface Thing {
  /** the word, in the form it was most often written — or the name you
   *  gave it */
  word: string;
  /** the words this row stands for, which are what a removal hides and a
   *  rename is stored against */
  words: string[];
  /** times it was crossed off — the answer to "how many times did I" */
  done: number;
  /** times it was written down at all, crossed off or not */
  written: number;
  /** the margin drawing for it, when there is one */
  icon: IconId | null;
}

export interface MonthReview {
  month: DayKey;
  title: string;
  things: Thing[];
  /** distinct lines written in the month, crossed off or not — only to
   *  tell "you wrote nothing" apart from "you crossed nothing off" */
  written: number;
}

/** Words that say nothing about what you did. Deliberately long: a list of
 *  "the", "about" and "really" is not a month. */
const EMPTY = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "if",
  "so",
  "than",
  "then",
  "that",
  "this",
  "these",
  "those",
  "there",
  "here",
  "it",
  "its",
  "to",
  "of",
  "in",
  "on",
  "at",
  "by",
  "for",
  "from",
  "with",
  "without",
  "about",
  "into",
  "over",
  "under",
  "up",
  "down",
  "out",
  "off",
  "again",
  "back",
  "all",
  "any",
  "some",
  "more",
  "most",
  "much",
  "many",
  "few",
  "new",
  "old",
  "my",
  "me",
  "mine",
  "we",
  "our",
  "us",
  "you",
  "your",
  "he",
  "she",
  "him",
  "her",
  "his",
  "they",
  "them",
  "their",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "am",
  "do",
  "does",
  "did",
  "done",
  "doing",
  "go",
  "going",
  "went",
  "get",
  "got",
  "getting",
  "have",
  "has",
  "had",
  "make",
  "made",
  "making",
  "take",
  "taken",
  "taking",
  "put",
  "need",
  "needs",
  "needed",
  "want",
  "wanted",
  "try",
  "tried",
  "start",
  "started",
  "finish",
  "finished",
  "check",
  "fix",
  "see",
  "saw",
  "look",
  "think",
  "thought",
  "know",
  "ask",
  "asked",
  "tell",
  "told",
  "come",
  "came",
  "give",
  "gave",
  "today",
  "tomorrow",
  "tonight",
  "yesterday",
  "morning",
  "afternoon",
  "evening",
  "night",
  "day",
  "days",
  "week",
  "weeks",
  "month",
  "months",
  "year",
  "years",
  "time",
  "times",
  "now",
  "soon",
  "later",
  "early",
  "late",
  "next",
  "last",
  "first",
  "second",
  "third",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "not",
  "no",
  "yes",
  "ok",
  "okay",
  "just",
  "very",
  "really",
  "still",
  "also",
  "only",
  "maybe",
  "good",
  "bad",
  "nice",
  "big",
  "small",
]);

/** As many rows as a month could sanely have. Not a page's worth — the
 *  list scrolls, and cutting it at a screenful was read as the page being
 *  broken ("I can't see anything below Praktikum"). High enough that a
 *  real month never reaches it; a ceiling at all only so a pathological
 *  notebook can't render a thousand rows. Anything you don't want to see
 *  is removed, which is the honest control and holds in every month. */
const MOST = 50;

/** Worth counting: long enough to mean something, not furniture, not a
 *  bare number. "3d" survives on the digit, "x3" does not on the length. */
function tells(word: string): boolean {
  if (word.length < 3) return false;
  if (EMPTY.has(word)) return false;
  if (/^\d+$/.test(word)) return false;
  return true;
}

/** Lines really on the page: not tombstones, not the breadcrumb a move
 *  leaves behind, not blank. */
function living(page: Page): Line[] {
  return page.lines.filter(
    (l) => !l.deletedAt && !l.carriedTo && l.text.trim().length > 0,
  );
}

/** Things that happened. Any kind of line — an event struck through is as
 *  much a thing you did as a task is. */
function done(page: Page): Line[] {
  return living(page).filter(isStruck);
}

/**
 * What the month was made of, commonest first.
 *
 * `pages` may cover more than the month; it is filtered here rather than
 * by the caller so the counts cannot drift from the month on the page.
 */
/** What the page has been told: hidden words, words to always show, and
 *  names to show them under. Keyed by the lowercased word. */
export type ThingPrefs = Record<
  string,
  | {
      hidden?: boolean;
      tracked?: boolean;
      label?: string;
      /** the other words of the row it was removed as */
      with?: string[];
    }
  | undefined
>;

export function reviewMonth(
  pages: Page[],
  month: DayKey,
  learned: Learned = {},
  floor = 2,
  prefs: ThingPrefs = {},
): MonthReview {
  const from = startOfMonth(month);
  const to = endOfMonth(month);

  /** word → the line ids it appeared on, so a word written twice in one
   *  line counts once and a carried task counts once however far it went */
  const seen = new Map<string, Set<string>>();
  /** word → the line ids where it was crossed off */
  const crossed = new Map<string, Set<string>>();
  /** word → how it was actually written, so the page says "Guitar" if that
   *  is what you write */
  const spelt = new Map<string, Map<string, number>>();
  /** line id → what that line actually said, for naming a merged thing */
  const said = new Map<string, string>();
  const lines = new Set<string>();

  for (const page of pages) {
    if (page.date < from || page.date > to) continue;
    const struck = new Set(done(page).map((l) => l.id));
    for (const line of living(page)) {
      lines.add(line.id);
      said.set(line.id, line.text.trim());
      for (const original of line.text.split(/[^\p{L}\p{N}]+/u)) {
        const word = original.toLowerCase();
        if (!tells(word) || prefs[word]?.hidden) continue;
        let ids = seen.get(word);
        if (!ids) seen.set(word, (ids = new Set()));
        ids.add(line.id);
        if (struck.has(line.id)) {
          let hit = crossed.get(word);
          if (!hit) crossed.set(word, (hit = new Set()));
          hit.add(line.id);
        }
        let forms = spelt.get(word);
        if (!forms) spelt.set(word, (forms = new Map()));
        forms.set(original, (forms.get(original) ?? 0) + 1);
      }
    }
  }

  // Words that turn up on exactly the same lines are one thing, not
  // several: "clean the kitchen" written three times is not "clean · 3"
  // and "kitchen · 3" on two rows, which reads as the page being broken.
  // Words that merely overlap are left alone — "guitar" covers both
  // "guitar" and "guitar practice", so it keeps its own larger count.
  const kept = [...seen.entries()].filter(
    ([word, ids]) => ids.size >= floor || prefs[word]?.tracked,
  );

  // A word that never appears without another one is that other one's
  // qualifier, not a thing of its own: "practice" only ever turns up
  // inside "guitar practice", so a row for it under the guitar row is
  // just the same evenings counted again under a vaguer name.
  const survives = kept.filter(
    ([word, ids]) =>
      !kept.some(
        ([other, theirs]) =>
          other !== word &&
          theirs.size > ids.size &&
          [...ids].every((id) => theirs.has(id)),
      ),
  );

  const groups = new Map<string, string[]>();
  for (const [word, ids] of survives) {
    const signature = [...ids].sort().join("\u0000");
    const group = groups.get(signature);
    if (group) group.push(word);
    else groups.set(signature, [word]);
  }

  const things: Thing[] = [];
  for (const [signature, group] of groups) {
    const ids = signature.split("\u0000");
    const word =
      group.length === 1
        ? (commonest(spelt.get(group[0])) ?? group[0])
        : // they only ever appear together, so the line itself is the name
          (commonest(tally(ids.map((id) => said.get(id) ?? ""))) ??
          group.join(" "));
    const struck = new Set<string>();
    for (const member of group) {
      for (const id of crossed.get(member) ?? []) struck.add(id);
    }
    const named = group.find((w) => prefs[w]?.label?.trim());
    things.push({
      word: named ? prefs[named]!.label!.trim() : word,
      words: group,
      done: struck.size,
      written: ids.length,
      icon: iconFor(word, learned) ?? iconFor(group[0], learned),
    });
  }

  // Something you asked to keep an eye on shows even in a month it never
  // came up in — an empty row is the honest answer to "how often did I do
  // this", and a thing that silently vanished would look like a bug.
  for (const [word, pref] of Object.entries(prefs)) {
    if (!pref?.tracked || pref.hidden) continue;
    if (things.some((t) => t.words.includes(word))) continue;
    things.push({
      word: pref.label?.trim() || word,
      words: [word],
      done: 0,
      written: 0,
      icon: iconFor(word, learned),
    });
  }
  // The crossings lead, because they are the answer to the question. When
  // nothing is crossed off at all the whole list ties on zero and falls
  // through to how often each thing was written, which is exactly the
  // right page for a notebook kept as a log.
  things.sort(
    (a, b) =>
      b.done - a.done || b.written - a.written || a.word.localeCompare(b.word),
  );

  return {
    month: from,
    title: monthTitle(from),
    things: things.slice(0, MOST),
    written: lines.size,
  };
}

function tally(values: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const v of values) if (v) out.set(v, (out.get(v) ?? 0) + 1);
  return out;
}

function commonest(forms: Map<string, number> | undefined): string | null {
  let best: string | null = null;
  let top = 0;
  for (const [form, n] of forms ?? []) {
    // ties go to the form seen first, so the page doesn't flicker between
    // "Gym" and "gym" as the month fills up
    if (n > top) {
      best = form;
      top = n;
    }
  }
  return best;
}
