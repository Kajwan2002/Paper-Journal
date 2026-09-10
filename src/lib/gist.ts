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
  if (res.status === 401) throw new Error("GitHub rejected that token.");
  if (res.status === 403) {
    throw new Error(
      "GitHub refused the request — the token may be missing gist access.",
    );
  }
  return res;
}

export async function whoami(token: string): Promise<string> {
  const res = await call(token, "/user");
  if (!res.ok) throw new Error(`GitHub said ${res.status}.`);
  return ((await res.json()) as { login: string }).login;
}

/** Find the journal gist this account already has, if any — so the second
 *  device doesn't create a rival copy. */
export async function findGist(token: string): Promise<string | null> {
  const res = await call(token, "/gists?per_page=100");
  if (!res.ok) throw new Error(`GitHub said ${res.status}.`);
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
  if (!res.ok) throw new Error(`Couldn't create the gist (${res.status}).`);
  return ((await res.json()) as { id: string }).id;
}

export interface GistRead {
  content: string | null;
  updatedAt: string | null;
}

export async function readGist(ref: GistRef): Promise<GistRead> {
  const res = await call(ref.token, `/gists/${ref.id}`);
  if (res.status === 404) throw new Error("That journal gist is gone.");
  if (!res.ok) throw new Error(`GitHub said ${res.status}.`);
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
  if (!res.ok) throw new Error(`Couldn't save to the gist (${res.status}).`);
  return ((await res.json()) as { updated_at: string }).updated_at;
}
