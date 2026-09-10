import type { Line } from "@/lib/rapidlog";
import type { Page } from "@/lib/db";

/** Merging one day's page from two devices.
 *
 *  Not a full CRDT — this data doesn't need one. Every line already carries
 *  its own id and, since sync, the time it last changed. So a page is really
 *  a set of independently edited lines, and merging is per line:
 *
 *    · a line only one side has is kept
 *    · a line both sides have resolves to whichever was edited later
 *    · a deletion is a tombstone with a time, so it competes on the same
 *      terms — delete on the iPad then edit on the PC and the edit wins,
 *      which is the way round that never loses writing
 *
 *  The consequence worth stating: nothing a merge does can silently drop a
 *  line. The worst case is a line you deleted coming back because the other
 *  device had touched it more recently. */

/** Lines written before sync existed have no stamp. Treat them as ancient so
 *  anything with a real timestamp wins, rather than letting `undefined`
 *  compare as newer. */
function stampOf(line: Line): number {
  return line.editedAt ?? line.deletedAt ?? 0;
}

function newer(a: Line, b: Line): Line {
  const sa = Math.max(stampOf(a), a.deletedAt ?? 0);
  const sb = Math.max(stampOf(b), b.deletedAt ?? 0);
  if (sa !== sb) return sa > sb ? a : b;
  // same instant, or both unstamped: prefer the one that still exists, then
  // settle it deterministically so both devices reach the same answer
  if (!!a.deletedAt !== !!b.deletedAt) return a.deletedAt ? b : a;
  return JSON.stringify(a) <= JSON.stringify(b) ? a : b;
}

/** Merge two versions of the same day. Order follows `mine` where possible,
 *  so a merge never reshuffles the page under the reader. */
export function mergeLines(mine: Line[], theirs: Line[]): Line[] {
  const byId = new Map<string, Line>();
  const order: string[] = [];

  for (const line of mine) {
    byId.set(line.id, line);
    order.push(line.id);
  }
  for (const line of theirs) {
    const existing = byId.get(line.id);
    if (!existing) {
      byId.set(line.id, line);
      order.push(line.id);
      continue;
    }
    byId.set(line.id, newer(existing, line));
  }

  return order.map((id) => byId.get(id)!).filter(Boolean);
}

export function mergePages(mine: Page, theirs: Page): Page {
  return {
    ...mine,
    lines: mergeLines(mine.lines, theirs.lines),
    updatedAt: Math.max(mine.updatedAt, theirs.updatedAt),
  };
}

/** What the UI is allowed to see. Tombstones exist only so the other device
 *  learns about a deletion; they are never drawn. */
export function living(lines: Line[]): Line[] {
  return lines.filter((l) => !l.deletedAt);
}

/** Diff the page as the reader left it against what was there before, and
 *  turn anything that disappeared into a tombstone. Called on every write,
 *  so a deletion is recorded the moment it happens rather than being
 *  inferred later from an absence. */
export function withTombstones(
  next: Line[],
  previous: Line[],
  now = Date.now(),
): Line[] {
  const kept = new Set(next.map((l) => l.id));
  const gone = previous.filter((l) => !kept.has(l.id) && !l.deletedAt);
  if (gone.length === 0) return next;
  return [
    ...next,
    ...gone.map((l) => ({
      // a tombstone keeps only what identifies it; the text goes
      id: l.id,
      kind: l.kind,
      text: "",
      deletedAt: now,
    })),
  ];
}

/** Stamp the lines the reader actually changed, leaving the rest alone so an
 *  untouched line doesn't win a merge it had no business winning. */
export function stampEdits(
  next: Line[],
  previous: Line[],
  now = Date.now(),
): Line[] {
  const before = new Map(previous.map((l) => [l.id, l]));
  return next.map((line) => {
    const was = before.get(line.id);
    if (was && sameLine(was, line)) return line;
    return { ...line, editedAt: now };
  });
}

function sameLine(a: Line, b: Line): boolean {
  return (
    a.text === b.text &&
    a.kind === b.kind &&
    !!a.struck === !!b.struck &&
    (a.indent ?? 0) === (b.indent ?? 0) &&
    a.due === b.due &&
    a.deadline === b.deadline &&
    !!a.someday === !!b.someday &&
    a.carriedTo === b.carriedTo &&
    (a.rolls ?? 0) === (b.rolls ?? 0)
  );
}
