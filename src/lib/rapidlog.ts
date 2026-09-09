/** The rapid-logging grammar from the design brief.
 *  You type a short prefix at the start of a line, or tap a signifier in the
 *  quick-add tray, and the page understands it. */

import type { DayKey } from "@/lib/date";

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
}

export function isStruck(line: Pick<Line, "kind" | "struck">): boolean {
  return line.struck === true || line.kind === "done";
}

/** kinds that count as an open, unfinished commitment worth carrying forward */
export function isOpenTask(line: Line): boolean {
  return (
    (line.kind === "task" ||
      line.kind === "priority" ||
      line.kind === "migrated") &&
    !isStruck(line) &&
    line.text.trim().length > 0
  );
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

export function glyphFor(line: Pick<Line, "kind" | "struck">): string {
  return isStruck(line) ? "×" : GLYPH[line.kind];
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
  return { ...line, kind: line.kind === "done" ? "task" : line.kind, struck: !isStruck(line) };
}

export function newLine(
  kind: LineKind = "note",
  text = "",
  indent: 0 | 1 = 0,
): Line {
  return { id: crypto.randomUUID(), kind, text, indent };
}
