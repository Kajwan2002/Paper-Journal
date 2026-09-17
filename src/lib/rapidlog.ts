/** The rapid-logging grammar from the design brief.
 *  You type a short prefix at the start of a line, or tap a signifier in the
 *  quick-add tray, and the page understands it. */

import type { DayKey } from "@/lib/date";
import { newId } from "@/lib/id";

export type LineKind =
  | "task"
  | "done" // legacy — normalised to task + struck on read
  | "event"
  | "migrated"
  | "priority"
  | "idea"
  | "note";

export interface Line {
  id: string;
  kind: LineKind;
  text: string;
  /** crossed out — done, dealt with, or moot. Independent of kind. */
  struck?: boolean;
  /** one level of sub-item; deeper nesting is deliberately not supported */
  indent?: 0 | 1;
  /** mornings this item has been carried forward unfinished */
  rolls?: number;
  /** the day it was first written */
  origin?: DayKey;
  /** stamped once rollover has forwarded this instance to a later day —
   *  its presence means "this is an old breadcrumb, not the live task" */
  carriedTo?: DayKey;
  /** scheduled for a later day — by typing "friday", or from the move menu.
   *  Until that day arrives the task sits quietly where you wrote it and is
   *  not carried forward or nagged about. */
  due?: DayKey;
  /** parked indefinitely. Never carried forward; only Open Loops finds it. */
  someday?: boolean;
  /** must be done *by* this day. Distinct from where the task sits: `due`
   *  and a move say "I'll do it then", a deadline says "after this it is
   *  too late". A task can be filed for one day and answer to another. */
  deadline?: DayKey;
  /** when this line last changed, for merging two devices. Stamped by the
   *  page store on write; absent on lines written before sync existed. */
  editedAt?: number;
  /** a tombstone: the line was deleted at this time. Kept in storage so a
   *  device that still has the line learns it is gone rather than putting
   *  it back. Never reaches the UI — the page store filters them out. */
  deletedAt?: number;
  /** where this line sits on the page, for lines that have ever actually
   *  been dragged. Absent on everything else — most lines just sit wherever
   *  they were written, and a merge falls back to the array position for
   *  those. Only a real drag stamps this, which is what lets a reorder
   *  survive a sync instead of the array position it changed being silently
   *  rebuilt from whichever device happened to be pulling. */
  order?: number;
}

/** A number for a freshly-placed line to sort by — monotonic even across
 *  several calls in the same millisecond, so lines created in a tight loop
 *  (rollover carrying a dozen tasks forward at once) still land in a
 *  stable, distinct order rather than tying. */
let lastOrder = 0;
export function nextOrder(): number {
  lastOrder = Math.max(Date.now(), lastOrder + 1);
  return lastOrder;
}

/** The gap a freshly-computed fallback position leaves between neighbours —
 *  small next to `nextOrder()`'s millisecond-since-epoch scale, so a page
 *  that has never been touched by a drag still sorts by its plain array
 *  order (each line `index * ORDER_GAP` apart) without ever outranking a
 *  line that actually has been placed somewhere on purpose. */
export const ORDER_GAP = 1000;

export function isStruck(line: Pick<Line, "kind" | "struck">): boolean {
  return line.struck === true || line.kind === "done";
}

/** kinds that carry a commitment, whether or not it is due yet */
export function isTaskKind(line: Line): boolean {
  return (
    line.kind === "task" || line.kind === "priority" || line.kind === "migrated"
  );
}

/** An unfinished commitment: a task-ish line with text that is not struck
 *  out. Says nothing about *when* — see `isDue`. */
export function isOpenTask(line: Line): boolean {
  return isTaskKind(line) && !isStruck(line) && line.text.trim().length > 0;
}

/** An open task that is actually asking for attention today: not parked in
 *  someday, and either unscheduled or scheduled for today or earlier.
 *
 *  A task that only carries a deadline (no `due`) sits quietly the same way
 *  a `due` task does, until the deadline itself arrives — the deadline chip
 *  and the "Coming up" note already answer for it every day before then, so
 *  it does not also need to occupy the daily list and get carried forward
 *  morning after morning. Once the deadline is today or has passed, it is
 *  simply an open task like any other. */
export function isDue(line: Line, on: DayKey): boolean {
  if (!isOpenTask(line) || line.someday) return false;
  if (line.due) return line.due <= on;
  if (line.deadline) return line.deadline <= on;
  return true;
}

/** Glyph shown in the margin for each kind. */
export const GLYPH: Record<LineKind, string> = {
  task: "•",
  done: "×",
  event: "○",
  migrated: "›",
  priority: "★",
  idea: "~",
  note: "–",
};

/** A deadline changes the shape of the mark, so a page tells you at a
 *  glance which of its tasks are answering to a date — without anyone
 *  having to pick an icon. */
export function glyphFor(
  line: Pick<Line, "kind" | "struck" | "deadline">,
): string {
  if (isStruck(line)) return "×";
  if (line.deadline && line.kind !== "event") return "◇";
  return GLYPH[line.kind];
}

/** The kinds offered in the quick-add tray, in tray order. */
export const QUICK_KINDS: LineKind[] = [
  "task",
  "priority",
  "event",
  "idea",
  "note",
];

/** Typed prefixes -> partial line. Prefix is stripped from the stored text. */
const PREFIXES: Array<[RegExp, Partial<Line> & { kind: LineKind }]> = [
  [/^\s*[-•]\s+/, { kind: "task" }],
  [/^\s*x\s+/i, { kind: "task", struck: true }],
  [/^\s*o\s+/i, { kind: "event" }],
  [/^\s*>\s+/, { kind: "migrated" }],
  [/^\s*\*\s+/, { kind: "priority" }],
  [/^\s*~\s+/, { kind: "idea" }],
];

/** Interpret a raw line of typed text. */
export function parseLine(raw: string): {
  kind: LineKind;
  text: string;
  struck?: boolean;
} {
  for (const [re, out] of PREFIXES) {
    if (re.test(raw)) return { ...out, text: raw.replace(re, "") };
  }
  return { kind: "note", text: raw };
}

/** Tapping a line's signifier: an idea becomes a task; everything else
 *  toggles struck. */
export function tapSignifier(line: Line): Line {
  if (line.kind === "idea" && !isStruck(line)) {
    return { ...line, kind: "task" };
  }
  const struck = !isStruck(line);
  return {
    ...line,
    kind: line.kind === "done" ? "task" : line.kind,
    struck,
    // finishing something retires its schedule and its nag count
    ...(struck
      ? { due: undefined, someday: undefined, deadline: undefined, rolls: 0 }
      : {}),
  };
}

/** An indented line has no id of its own to point at a parent — the array
 *  order already says who it belongs to, the same way a hanging indent does
 *  on paper: it belongs to the nearest unindented line above it, until the
 *  next one. `[start, end)` — empty when `parentIndex` doesn't point at an
 *  unindented line, since a child (one level is all there is) has none. */
export function childRangeOf(
  lines: Line[],
  parentIndex: number,
): [number, number] {
  if ((lines[parentIndex]?.indent ?? 0) !== 0) {
    return [parentIndex, parentIndex];
  }
  let end = parentIndex + 1;
  while (end < lines.length && (lines[end].indent ?? 0) === 1) end++;
  return [parentIndex + 1, end];
}

/** Retire a line the way `tapSignifier` retires the one you actually
 *  tapped, but forced to a given struck state rather than toggled — for
 *  cascading onto children, which didn't ask to be struck themselves. */
function forceStruck(line: Line, struck: boolean): Line {
  return {
    ...line,
    kind: line.kind === "done" ? "task" : line.kind,
    struck,
    ...(struck
      ? { due: undefined, someday: undefined, deadline: undefined, rolls: 0 }
      : {}),
  };
}

/** Tap a signifier, and — if it belongs to an unindented line with a group
 *  of indented lines under it — carry the same struck state onto every one
 *  of them. Ticking off "Rewe Shopping" crosses off Cola, Grill Peppers and
 *  the rest with it, because on paper they were never separate items, just
 *  one item with a list under it. Tapping a child, or a line with no
 *  children, changes only that one line — same as `tapSignifier` alone. */
export function toggleWithChildren(lines: Line[], id: string): Line[] {
  const idx = lines.findIndex((l) => l.id === id);
  if (idx < 0) return lines;
  const after = tapSignifier(lines[idx]);
  const nextStruck = isStruck(after);
  const [start, end] = childRangeOf(lines, idx);
  return lines.map((line, i) => {
    if (i === idx) return after;
    if (i >= start && i < end) return forceStruck(line, nextStruck);
    return line;
  });
}

export function newLine(
  kind: LineKind = "note",
  text = "",
  indent: 0 | 1 = 0,
): Line {
  return { id: newId(), kind, text, indent };
}

/** Move the line at `from` to `to`, and stamp *only* that line with an
 *  `order` placing it between its new neighbours. That single stamp is
 *  what lets a drag survive a sync — see `mergeLines`. Every other line
 *  on the page is returned untouched, on purpose: giving the whole page a
 *  fresh position on every drag would let a reorder that only meant to
 *  move one line outrank a genuine, older, unrelated edit made to some
 *  other line on another device in the meantime. */
export function reorderLine(lines: Line[], from: number, to: number): Line[] {
  const target = Math.max(0, Math.min(lines.length - 1, to));
  if (from === target || from < 0 || from >= lines.length) return lines;

  const next = [...lines];
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);

  // neighbours' fallback keys use their position in the array as it was
  // *before* this move — the same array every other device still has, so
  // an untouched neighbour's guessed key lines up with what a merge will
  // independently compute for it there too
  const origIndex = new Map(lines.map((l, i) => [l.id, i]));
  const keyOf = (line: Line | undefined) =>
    line
      ? (line.order ?? (origIndex.get(line.id) ?? 0) * ORDER_GAP)
      : undefined;
  const before = keyOf(next[target - 1]);
  const after = keyOf(next[target + 1]);
  const order =
    before !== undefined && after !== undefined
      ? (before + after) / 2
      : before !== undefined
        ? before + ORDER_GAP
        : after !== undefined
          ? after - ORDER_GAP
          : nextOrder();

  next[target] = { ...moved, order };
  return next;
}
