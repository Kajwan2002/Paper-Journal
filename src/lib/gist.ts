/** GitHub gists as the place the journal meets itself.
 *
 *  Chosen because it is the only backing that costs nothing forever, has no
 *  usage tier to outgrow, and needs no account you don't already have. The
 *  app keeps one secret gist holding a single encrypted file, reads it on
 *  open and writes it after you stop typing. GitHub sees ciphertext. */

const API = "https://api.github.com";
export const FILENAME = "marginalia.journal.enc";
const DESCRIPTION = "Marginalia — encrypted journal (do not edit by hand)";

export interface GistRef {
  id: string;
  token: string;
}

async function call(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (res.ok) return res;
  throw new Error(await explainFailure(res));
}

/** GitHub answers 403 for several unrelated things, and guessing between
 *  them wastes the reader's afternoon. Read what it actually said. */
async function explainFailure(res: Response): Promise<string> {
  let detail = "";
  try {
    const body = (await res.clone().json()) as { message?: string };
    detail = body?.message ?? "";
  } catch {
    /* not JSON; the status is all we have */
  }

  if (res.status === 401) {
    return "GitHub rejected the token — it may have expired or been revoked. Use “Replace token” to paste a new one.";
  }

  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    const reset = res.headers.get("x-ratelimit-reset");
    if (remaining === "0" && reset) {
      const when = new Date(Number(reset) * 1000);
      return `GitHub is rate limiting this token until ${when.toLocaleTimeString()} — it usually means something else is using the same token hard. Sync will resume by itself.`;
    }
    if (/secondary rate/i.test(detail)) {
      return "GitHub is throttling writes on this token — often because another app is sharing it. Sync will resume by itself shortly.";
    }
    return (
      "GitHub refused this token access to gists. Fine-grained tokens cannot touch gists at all — it has to be a classic token with the “gist” scope. Use “Replace token” to paste one." +
      (detail ? ` (GitHub said: ${detail})` : "")
    );
  }

  if (res.status === 404) {
    return "That journal gist is gone, or this token can't see it.";
  }

  return detail
    ? `GitHub said ${res.status}: ${detail}`
    : `GitHub said ${res.status}.`;
}

export async function whoami(token: string): Promise<string> {
  const res = await call(token, "/user");
  return ((await res.json()) as { login: string }).login;
}

/** Does this token actually have gist access? `/user` succeeds for tokens
 *  that can do nothing else, so setup used to look fine and fail later. */
export async function canUseGists(token: string): Promise<void> {
  await call(token, "/gists?per_page=1");
}

/** Find the journal gist this account already has, if any — so the second
 *  device doesn't create a rival copy. */
export async function findGist(token: string): Promise<string | null> {
  const res = await call(token, "/gists?per_page=100");
  const gists = (await res.json()) as Array<{
    id: string;
    files: Record<string, unknown>;
  }>;
  return gists.find((g) => g.files && FILENAME in g.files)?.id ?? null;
}

export async function createGist(
  token: string,
  content: string,
): Promise<string> {
  const res = await call(token, "/gists", {
    method: "POST",
    body: JSON.stringify({
      description: DESCRIPTION,
      public: false,
      files: { [FILENAME]: { content } },
    }),
  });
  return ((await res.json()) as { id: string }).id;
}

export interface GistRead {
  content: string | null;
  updatedAt: string | null;
}

export async function readGist(ref: GistRef): Promise<GistRead> {
  const res = await call(ref.token, `/gists/${ref.id}`);
  const gist = (await res.json()) as {
    updated_at: string;
    files: Record<
      string,
      { content?: string; truncated?: boolean; raw_url?: string }
    >;
  };
  const file = gist.files?.[FILENAME];
  if (!file) return { content: null, updatedAt: gist.updated_at };

  // GitHub truncates inline content past ~1MB and hands you a raw URL
  if (file.truncated && file.raw_url) {
    const raw = await fetch(file.raw_url);
    if (!raw.ok) throw new Error("Couldn't fetch the full journal.");
    return { content: await raw.text(), updatedAt: gist.updated_at };
  }
  return { content: file.content ?? null, updatedAt: gist.updated_at };
}

export async function writeGist(
  ref: GistRef,
  content: string,
): Promise<string> {
  const res = await call(ref.token, `/gists/${ref.id}`, {
    method: "PATCH",
    body: JSON.stringify({ files: { [FILENAME]: { content } } }),
  });
  return ((await res.json()) as { updated_at: string }).updated_at;
}
