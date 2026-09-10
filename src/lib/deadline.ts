import { db, pageId } from "@/lib/db";
import { flushAsync, getCached } from "@/lib/pageStore";
import { diffDays, relativeDay, todayKey, type DayKey } from "@/lib/date";
import { isOpenTask, type Line } from "@/lib/rapidlog";

/** Deadlines.
 *
 *  "I'll do it on Thursday" is where a task *sits*; "it has to be done by
 *  Thursday" is what it answers to. The second one is the dangerous kind,
 *  because a task filed on a future page is out of sight — and finding out
 *  on the morning of the deadline is exactly too late. So a deadline earns
 *  its own mark, its own countdown, and a standing note on today's page
 *  from a week out. */

export const WARN_DAYS = 7;

export type Urgency = "later" | "soon" | "close" | "today" | "late";

export function urgencyOf(deadline: DayKey, on: DayKey = todayKey()): Urgency {
  const days = diffDays(on, deadline);
  if (days < 0) return "late";
  if (days === 0) return "today";
  if (days <= 2) return "close";
  if (days <= WARN_DAYS) return "soon";
  return "later";
}

/** What the chip on the line says. Counts down when the day is near enough
 *  to matter, and names the date when it is still far off. */
export function deadlineLabel(
  deadline: DayKey,
  on: DayKey = todayKey(),
): string {
  const days = diffDays(on, deadline);
  if (days < 0) return days === -1 ? "1 day late" : `${-days} days late`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  if (days <= WARN_DAYS) return `${days} days left`;
  return `by ${relativeDay(deadline, on)}`;
}

/** The same fact, compressed. The chip sits on the line itself, where every
 *  character it takes is a character of the task you can no longer read —
 *  the prose version belongs in the margin note and in Open Loops. */
export function deadlineShort(
  deadline: DayKey,
  on: DayKey = todayKey(),
): string {
  const days = diffDays(on, deadline);
  if (days < 0) return `${-days}d late`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= WARN_DAYS) return `${days}d`;
  return relativeDay(deadline, on);
}

export interface Due {
  date: DayKey;
  line: Line;
  deadline: DayKey;
  urgency: Urgency;
  days: number;
}

/** Every unfinished task with a deadline, wherever in the notebook it is
 *  sitting — including on pages far in the future, which is the whole
 *  point. Sorted most urgent first. */
export async function deadlines(notebookId: string): Promise<Due[]> {
  await flushAsync();
  const pages = await db.pages.where("notebookId").equals(notebookId).toArray();
  const today = todayKey();
  const out: Due[] = [];

  for (const page of pages) {
    const lines = getCached(pageId(notebookId, page.date)) ?? page.lines;
    for (const line of lines) {
      if (!line.deadline || line.carriedTo || line.someday) continue;
      if (!isOpenTask(line)) continue;
      out.push({
        date: page.date,
        line,
        deadline: line.deadline,
        urgency: urgencyOf(line.deadline, today),
        days: diffDays(today, line.deadline),
      });
    }
  }

  out.sort((a, b) => a.days - b.days);
  return out;
}

/** The ones worth putting in front of someone today: anything overdue, and
 *  anything inside the warning window. */
export async function comingDue(notebookId: string): Promise<Due[]> {
  return (await deadlines(notebookId)).filter((d) => d.urgency !== "later");
}
