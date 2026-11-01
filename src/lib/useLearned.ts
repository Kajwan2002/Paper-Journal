import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { asLearned } from "@/lib/iconmemory";
import type { Learned } from "@/lib/iconfor";

/** What this notebook has been taught, kept live: teaching a word on one
 *  page redraws every other page that says it, and so does a word arriving
 *  from the other device. */
export function useLearned(): Learned {
  return (
    useLiveQuery(async () => asLearned(await db.iconWords.toArray()), [], {}) ??
    {}
  );
}
