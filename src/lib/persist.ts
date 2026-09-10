/** Ask the browser to stop treating a year of someone's journal as a cache.
 *
 *  Without this, Safari evicts IndexedDB for a site not visited in seven
 *  days, and Chrome clears it under storage pressure. `persist()` is granted
 *  silently once the app looks "engaged" (installed to the home screen, or
 *  bookmarked, or used repeatedly) — so it is worth asking again after the
 *  first real write, not only at boot. */

let asked = false;

export async function requestPersistence(): Promise<boolean> {
  if (asked) return isPersisted();
  asked = true;
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function isPersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}

/** Rough disk picture, for the settings panel. */
export async function storageEstimate(): Promise<{
  usedMB: number;
  quotaMB: number;
} | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e?.usage || !e?.quota) return null;
    return {
      usedMB: e.usage / 1024 / 1024,
      quotaMB: e.quota / 1024 / 1024,
    };
  } catch {
    return null;
  }
}
