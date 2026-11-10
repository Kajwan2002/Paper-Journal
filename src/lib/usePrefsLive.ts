import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { asPrefs } from "@/lib/things";
import type { ThingPrefs } from "@/lib/month";

/** What the month page has been told, kept live: removing a thing redraws
 *  the page at once, and so does a removal arriving from the other
 *  device. */
export function usePrefsLive(): ThingPrefs {
  return (
    useLiveQuery(async () => asPrefs(await db.thingPrefs.toArray()), [], {}) ??
    {}
  );
}
