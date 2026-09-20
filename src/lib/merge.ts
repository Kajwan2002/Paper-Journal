import { ORDER_GAP, type Line } from "@/lib/rapidlog";
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

/** Where a line sits is settled on its own stamp, not on `editedAt`. Drag a
 *  line on the phone while rewriting it on the pc and both should land: the
 *  move is not an edit and the edit is not a move. */
function placedLater(a: Line, b: Line): Line {
  const pa = a.orderedAt ?? 0;
  const pb = b.orderedAt ?? 0;
  if (pa !== pb) return pa > pb ? a : b;
  if (a.order !== b.order) return (a.order ?? 0) < (b.order ?? 0) ? a : b;
  return a;
}

/** Give every line a position on the page's own scale, filling in the ones
 *  that haven't got one from the neighbours that have. Called on every
 *  write, so a page settles into positions that a merge can sort by without
 *  ever falling back to an array index — an index shifts whenever anything
 *  above it is added or removed, and mixing shifting keys with fixed ones is
 *  what used to make a page reshuffle itself seconds after being written on.
 *
 *  Only untouched-by-number lines are given one, so an ordinary write leaves
 *  every position on the page exactly as it found it. */
export function withOrder(lines: Line[], now = Date.now()): Line[] {
  if (lines.every((l) => l.order !== undefined)) return lines;

  const out = [...lines];
  let i = 0;
  while (i < out.length) {
    if (out[i].order !== undefined) {
      i++;
      continue;
    }
    let j = i;
    while (j < out.length && out[j].order === undefined) j++;
    // whatever sits either side of this run already has a position, so the
    // run is shared out between them rather than counted from anywhere
    const lo = i > 0 ? out[i - 1].order : undefined;
    const hi = j < out.length ? out[j].order : undefined;
    const span = j - i;
    for (let k = 0; k < span; k++) {
      const order =
        lo !== undefined && hi !== undefined
          ? lo + ((hi - lo) / (span + 1)) * (k + 1)
          : lo !== undefined
            ? lo + ORDER_GAP * (k + 1)
            : hi !== undefined
              ? hi - ORDER_GAP * (span - k)
              : k * ORDER_GAP;
      out[i + k] = { ...out[i + k], order, orderedAt: now };
    }
    i = j;
  }
  return out;
}

/** Merge two versions of the same day, sorting the result by the position
 *  every line carries. A line both sides have takes its words from whichever
 *  was edited later and its position from whichever was placed later, which
 *  are deliberately two different questions.
 *
 *  A line that still has no position — one written by a device that hasn't
 *  learnt to record them — falls back to where it sits in `mine`, and the
 *  next write gives it a real one. */
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
    const said = newer(existing, line);
    const placed = placedLater(existing, line);
    byId.set(
      line.id,
      said === placed
        ? said
        : { ...said, order: placed.order, orderedAt: placed.orderedAt },
    );
  }

  const fallback = new Map(order.map((id, i) => [id, i * ORDER_GAP]));
  const keyOf = (id: string) => byId.get(id)!.order ?? fallback.get(id)!;

  return [...order]
    .sort((a, b) => keyOf(a) - keyOf(b) || (a < b ? -1 : a > b ? 1 : 0))
    .map((id) => byId.get(id)!);
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
    // `order` is deliberately not here: where a line sits is not something
    // it *said*, and stamping `editedAt` for a move would let dragging a
    // line on one device beat rewriting it on another. It settles on
    // `orderedAt` instead.
  );
}
