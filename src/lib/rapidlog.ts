/** The rapid-logging grammar from the design brief.
 *  You type a short prefix at the start of a line and the page understands it. */

export type LineKind =
  | "task"
  | "done"
  | "event"
  | "migrated"
  | "priority"
  | "idea"
  | "note";

export interface Line {
  id: string;
  kind: LineKind;
  text: string;
}

/** Glyph shown in the margin for each kind. */
export const GLYPH: Record<LineKind, string> = {
  task: "•", // •
  done: "×", // ×
  event: "○", // ○
  migrated: "›", // ›
  priority: "★", // ★
  idea: "~", // ~
  note: "–", // –
};

/** Typed prefixes -> kind. Prefix is stripped from the stored text. */
const PREFIXES: Array<[RegExp, LineKind]> = [
  [/^\s*[-•]\s+/, "task"],
  [/^\s*x\s+/i, "done"],
  [/^\s*o\s+/i, "event"],
  [/^\s*>\s+/, "migrated"],
  [/^\s*\*\s+/, "priority"],
  [/^\s*~\s+/, "idea"],
];

/** Interpret a raw line of typed text. Returns the detected kind and the
 *  remaining text once any signifier prefix has been consumed. */
export function parseLine(raw: string): { kind: LineKind; text: string } {
  for (const [re, kind] of PREFIXES) {
    if (re.test(raw)) return { kind, text: raw.replace(re, "") };
  }
  return { kind: "note", text: raw };
}

/** Tapping a line's glyph cycles it through the states that make sense. */
export function cycleKind(kind: LineKind): LineKind {
  switch (kind) {
    case "task":
      return "done";
    case "done":
      return "task";
    case "priority":
      return "done";
    case "idea":
      return "task";
    default:
      return kind;
  }
}

export function newLine(kind: LineKind = "note", text = ""): Line {
  return { id: crypto.randomUUID(), kind, text };
}
