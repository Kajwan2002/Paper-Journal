import { createGist, findGist, whoami } from "@/lib/gist";
import { BACKUP_FORMAT } from "@/lib/backup";
import { encrypt, exportKey, makeKey } from "@/lib/crypto";
import { fromBase64, toBase64 } from "@/lib/crypto";
import type { SyncConfig } from "@/state/sync";

/** Pairing a second device.
 *
 *  The first device is set up with a GitHub token. From then on it can hand
 *  out a single sync code that carries everything the next device needs —
 *  the gist, the key, and the token — so pairing is one paste rather than a
 *  form. The code is as sensitive as the token inside it, which is why the
 *  UI says so out loud. */

const PREFIX = "marg1.";

export function makeSyncCode(config: SyncConfig): string {
  const payload = JSON.stringify({
    t: config.token,
    g: config.gistId,
    k: config.key,
  });
  return PREFIX + toBase64(new TextEncoder().encode(payload));
}

export function readSyncCode(code: string): SyncConfig {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PREFIX)) {
    throw new Error("That doesn't look like a Marginalia sync code.");
  }
  let parsed: { t?: string; g?: string; k?: string };
  try {
    parsed = JSON.parse(
      new TextDecoder().decode(fromBase64(trimmed.slice(PREFIX.length))),
    );
  } catch {
    throw new Error("That sync code is damaged — copy it again.");
  }
  if (!parsed.t || !parsed.g || !parsed.k) {
    throw new Error("That sync code is incomplete — copy it again.");
  }
  return { token: parsed.t, gistId: parsed.g, key: parsed.k };
}

/** Raised when the account already holds a journal we have no key for.
 *  Recoverable — the reader just needs the sync code from the other device
 *  rather than a fresh setup. */
export class NeedsSyncCode extends Error {
  constructor() {
    super(
      "This GitHub account already has a Marginalia journal. Paste the sync code from your other device so both can read it.",
    );
    this.name = "NeedsSyncCode";
  }
}

/** First device: check the token, mint a key, create the journal gist.
 *
 *  If the account already has one we stop rather than making a second — a
 *  rival gist would quietly split the journal in two, and the key for the
 *  first one only exists on the device that made it. */
export async function connectWithToken(token: string): Promise<SyncConfig> {
  const clean = token.trim();
  if (!clean) throw new Error("Paste a GitHub token first.");
  const login = await whoami(clean);

  if (await findGist(clean)) throw new NeedsSyncCode();

  const key = await makeKey();
  const encoded = await exportKey(key);
  // a complete, empty journal rather than a marker — the first pull parses
  // whatever it finds, and a half-shaped seed made it throw
  const empty = await encrypt(
    key,
    JSON.stringify({
      format: BACKUP_FORMAT,
      app: "marginalia",
      exportedAt: new Date().toISOString(),
      notebooks: [],
      pages: [],
    }),
  );
  const gistId = await createGist(clean, empty);
  return { token: clean, gistId, key: encoded, login };
}
