import type { FirebaseApp } from "firebase/app";
import type { Auth, User } from "firebase/auth";
import type { Firestore, Unsubscribe } from "firebase/firestore";
import { db, type Notebook, type Page, type WeekNote } from "@/lib/db";
import { flushAsync, subscribeJournal } from "@/lib/pageStore";
import { mergeLines } from "@/lib/merge";
import { newId } from "@/lib/id";
import {
  activeConfig,
  cloudAvailable,
  usingEmulator,
} from "@/lib/firebase-config";
import { reconcileNotebooks } from "@/lib/shelf";
import { useSession } from "@/state/session";
import { useCloud, type CloudConfig, type CloudMode } from "@/state/cloud";

/** Sync, over Firestore.
 *
 *  This replaces the transport only. Two devices still settle a page the
 *  way they always have — per line, by `editedAt` for what a line says and
 *  `orderedAt` for where it sits (see `mergeLines`). Firestore decides
 *  *when* a change arrives, not who wins; there is still nothing
 *  arbitrating, and the merge is what makes both devices agree.
 *
 *  What it buys over the gist it replaces: a change lands in about a
 *  second instead of up to ninety, because the connection stays open
 *  rather than being polled; only the page you touched is written, so it
 *  does not slow down as the journal grows; and there is no credential to
 *  create, expire or revoke.
 *
 *  The SDK is large, so it is a lazy import: it is parsed and run only
 *  once sync is actually turned on, and it stays out of the main bundle.
 *  The service worker does precache the chunks along with the rest of the
 *  shell, which is deliberate — it means turning sync on works on a train,
 *  rather than failing because the one thing not cached is the thing you
 *  just asked for. */

const PUSH_DEBOUNCE_MS = 700;
/** how long to let the first snapshot land before writing anything up */
const FIRST_SNAPSHOT_MS = 8000;
/** set just before leaving for a Google sign-in, so a cold start can tell
 *  whether there is a redirect to finish — without that, every launch would
 *  download the SDK just to ask */
const RETURNING = "marginalia.cloud.returning";

interface Live {
  app: FirebaseApp;
  auth: Auth;
  store: Firestore;
}

let live: Live | null = null;
let listeners: Unsubscribe[] = [];
let stopWatching: (() => void) | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
/** the content last written for each document, so our own echo — and a
 *  local save that changed nothing — costs no write */
const sent = new Map<string, string>();
/** which pages have changed since the last push. `null` means "something
 *  changed that doesn't name a page", so look at everything. */
let pending: Set<string> | null = null;

interface Sdk {
  app: typeof import("firebase/app");
  auth: typeof import("firebase/auth");
  firestore: typeof import("firebase/firestore");
}

let loading: Promise<Sdk> | null = null;

/** The SDK, fetched once. Everything below asks for it rather than holding
 *  it, because the first ask is a download. */
function sdk(): Promise<Sdk> {
  loading ??= (async () => {
    const [app, auth, firestore] = await Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
      import("firebase/firestore"),
    ]);
    return { app, auth, firestore };
  })();
  return loading;
}

/** Bring up the SDK. Safe before a journal has been chosen, which is what
 *  signing in needs. */
async function boot(): Promise<Live> {
  if (live) return live;
  if (!cloudAvailable()) throw new Error("Sync isn't set up in this build.");
  const { app, auth, firestore } = await sdk();
  const instance = app.getApps().length
    ? app.getApp()
    : app.initializeApp(activeConfig());
  const a = auth.getAuth(instance);
  // A line that has just been dragged carries `order: undefined` until the
  // next write fills it in, and a task with no deadline simply has no
  // `deadline`. Firestore throws on an undefined field value rather than
  // treating it as absent, which would have meant every drag breaking sync.
  const s = firestore.initializeFirestore(instance, {
    ignoreUndefinedProperties: true,
  });
  if (usingEmulator()) {
    auth.connectAuthEmulator(a, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    firestore.connectFirestoreEmulator(s, "127.0.0.1", 8080);
  }
  live = { app: instance, auth: a, store: s };
  return live;
}

// --- getting in ------------------------------------------------------

function remember(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // a browser with site data blocked; the worst case is one lost redirect
  }
}

/** True if this load is the far side of a Google sign-in that left the app. */
export function returningFromSignIn(): boolean {
  try {
    return localStorage.getItem(RETURNING) === "1";
  } catch {
    return false;
  }
}

/** Signing in with Google. Inside a home-screen app on iOS a popup is
 *  sandboxed away from the app that opened it and can never hand the
 *  result back, so that case has to leave and come back instead. */
export async function signInWithGoogle(): Promise<CloudConfig | null> {
  const l = await boot();
  const { auth } = await sdk();
  const provider = new auth.GoogleAuthProvider();
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true;

  if (standalone) {
    remember(RETURNING, "1");
    await auth.signInWithRedirect(l.auth, provider);
    return null; // the page is leaving; `resumeRedirect` finishes it
  }
  const cred = await auth.signInWithPopup(l.auth, provider);
  return {
    mode: "google",
    journalId: cred.user.uid,
    label: cred.user.email ?? undefined,
  };
}

/** Finish a sign-in that left the app and came back. */
export async function resumeRedirect(): Promise<CloudConfig | null> {
  if (!cloudAvailable() || !returningFromSignIn()) return null;
  try {
    const l = await boot();
    const { auth } = await sdk();
    const cred = await auth.getRedirectResult(l.auth);
    if (!cred?.user) return null;
    return {
      mode: "google",
      journalId: cred.user.uid,
      label: cred.user.email ?? undefined,
    };
  } finally {
    remember(RETURNING, null);
  }
}

/** A journal that needs no account at all. The id *is* the secret, so it
 *  is long and random; the leading `c` is what the rules look for to let a
 *  second device open it by pasting the code. Unlike the token this
 *  replaces, it never expires and is never revoked. */
export function newPairingCode(): string {
  let hex = "";
  while (hex.length < 32) hex += newId().replace(/[^0-9a-f]/g, "");
  return "c" + hex.slice(0, 32);
}

export function readPairingCode(raw: string): string {
  const clean = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "");
  if (!/^c[0-9a-f]{32}$/.test(clean)) {
    throw new Error("That doesn't look like a pairing code.");
  }
  return clean;
}

/** The code, in chunks, because a wall of 33 hex digits is unreadable and
 *  unfaithfully retyped. `readPairingCode` puts it back together. */
export function spacedCode(code: string): string {
  return (code.match(/.{1,6}/g) ?? [code]).join(" ");
}

/** Sign in anonymously — asks nothing of anyone, cannot be blocked by a
 *  sandboxed popup — and join the journal the code names. */
export async function joinWithCode(journalId: string): Promise<CloudConfig> {
  const l = await boot();
  const { auth } = await sdk();
  if (!l.auth.currentUser) await auth.signInAnonymously(l.auth);
  return { mode: "code", journalId };
}

async function ensureSignedIn(mode: CloudMode): Promise<User> {
  const l = await boot();
  const { auth } = await sdk();
  if (l.auth.currentUser) return l.auth.currentUser;
  if (mode === "code") return (await auth.signInAnonymously(l.auth)).user;
  return new Promise<User>((resolve, reject) => {
    const stop = auth.onAuthStateChanged(
      l.auth,
      (user) => {
        if (!user) return;
        stop();
        resolve(user);
      },
      (err) => {
        stop();
        reject(err as Error);
      },
    );
  });
}

// --- the wire --------------------------------------------------------

type Kind = "pages" | "notebooks" | "weekNotes";

function pathOf(journalId: string, kind: Kind): string {
  return `journals/${journalId}/${kind}`;
}

/** Fold one remote page into the local copy, line by line. Returns true if
 *  anything here actually changed. */
async function absorbPage(remote: Page): Promise<boolean> {
  if (!remote?.id || !Array.isArray(remote.lines)) return false;
  const mine = await db.pages.get(remote.id);
  if (!mine) {
    await db.pages.put(remote);
    return true;
  }
  const lines = mergeLines(mine.lines, remote.lines);
  if (JSON.stringify(lines) === JSON.stringify(mine.lines)) return false;
  await db.pages.put({
    ...mine,
    lines,
    updatedAt: Math.max(mine.updatedAt, remote.updatedAt ?? 0),
  });
  return true;
}

async function absorbNotebook(remote: Notebook): Promise<boolean> {
  if (!remote?.id) return false;
  const mine = await db.notebooks.get(remote.id);
  if (!mine) {
    await db.notebooks.add(remote);
    return true;
  }
  if ((remote.createdAt ?? 0) > (mine.createdAt ?? 0)) {
    await db.notebooks.put(remote);
    return true;
  }
  return false;
}

/** Free text with no per-line ids — the newest write for the week wins,
 *  rather than trying to merge sentences word by word. */
async function absorbWeekNote(remote: WeekNote): Promise<boolean> {
  if (!remote?.id || !Array.isArray(remote.lines)) return false;
  const mine = await db.weekNotes.get(remote.id);
  if (!mine || remote.updatedAt > mine.updatedAt) {
    await db.weekNotes.put(remote);
    return true;
  }
  return false;
}

function announce(adopt: string | null): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("marginalia:pulled", { detail: { adopt } }),
  );
}

/** Both devices seeded themselves a notebook before either knew the other
 *  existed, so pairing leaves two on the shelf and each device still
 *  looking at its own — which reads as "my journal didn't arrive". Work out
 *  which one is the real journal, bin the untouched seed, and say so.
 *
 *  The seed goes from the cloud too. Deleting it only here would leave the
 *  copy up there to arrive again on the next connection, and the shelf
 *  would grow a ghost notebook back every time the app started. */
async function reshelve(journalId: string): Promise<string | null> {
  const { adopt, removed } = await reconcileNotebooks(
    useSession.getState().notebookId,
  );
  if (removed.length > 0) {
    const l = await boot();
    const { firestore } = await sdk();
    await Promise.all(
      removed.map((id) => {
        sent.delete(`notebooks/${id}`);
        return firestore.deleteDoc(
          firestore.doc(l.store, pathOf(journalId, "notebooks"), id),
        );
      }),
    ).catch(() => {
      // it will be tried again next time the shelf is reconciled
    });
  }
  return adopt;
}

/** What to write up. `scope` is the set of pages known to have changed;
 *  `null` asks for the whole journal, which is what a first upload needs.
 *
 *  Notebooks and week notes are always read whole — there are a handful of
 *  the first and one a week of the second, so narrowing them would save
 *  nothing. Pages are the part that grows without limit. */
async function localDocs(
  scope: Set<string> | null,
): Promise<Array<[Kind, string, object]>> {
  await flushAsync();
  const [notebooks, weekNotes] = await Promise.all([
    db.notebooks.toArray(),
    db.weekNotes.toArray(),
  ]);
  const pages = scope
    ? (await Promise.all([...scope].map((id) => db.pages.get(id)))).filter(
        (p): p is Page => Boolean(p),
      )
    : await db.pages.toArray();

  return [
    ...notebooks.map((n) => ["notebooks", n.id, n] as [Kind, string, object]),
    ...pages.map((p) => ["pages", p.id, p] as [Kind, string, object]),
    ...weekNotes.map((w) => ["weekNotes", w.id, w] as [Kind, string, object]),
  ];
}

/** Write up everything that differs from what we last sent. Firestore
 *  caps a batch at 500 writes, so a first upload of a long journal goes in
 *  chunks. */
async function push(journalId: string): Promise<void> {
  const l = await boot();
  const { firestore } = await sdk();
  // claim the pending set before awaiting anything else, so an edit made
  // during this push is queued for the next one rather than dropped
  const scope = pending;
  pending = new Set();

  try {
    const docs = await localDocs(scope);
    const dirty = docs.filter(
      ([kind, id, value]) =>
        sent.get(`${kind}/${id}`) !== JSON.stringify(value),
    );
    if (dirty.length === 0) return;

    for (let i = 0; i < dirty.length; i += 400) {
      const slice = dirty.slice(i, i + 400);
      const batch = firestore.writeBatch(l.store);
      for (const [kind, id, value] of slice) {
        batch.set(firestore.doc(l.store, pathOf(journalId, kind), id), value);
      }
      await batch.commit();
      for (const [kind, id, value] of slice) {
        sent.set(`${kind}/${id}`, JSON.stringify(value));
      }
    }
    useCloud.getState().touched();
  } catch (err) {
    // hand the work back, or a page that failed to go up would stay behind
    // until something happened to touch it again
    if (scope === null) pending = null;
    else if (pending) for (const key of scope) pending.add(key);
    throw err;
  }
}

function schedulePush(journalId: string, key?: string): void {
  if (key === undefined) pending = null;
  else pending?.add(key);
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void push(journalId).catch((err) =>
      useCloud.getState().setPhase("error", explain(err)),
    );
  }, PUSH_DEBOUNCE_MS);
}

interface Opened {
  stop: Unsubscribe;
  /** resolves once this collection has delivered its first snapshot */
  first: Promise<void>;
}

/** Listen to one collection and fold whatever arrives into the journal. */
async function listen(
  journalId: string,
  kind: Kind,
  absorb: (doc: never) => Promise<boolean>,
): Promise<Opened> {
  const l = await boot();
  const { firestore } = await sdk();
  let settle = (): void => {};
  const first = new Promise<void>((resolve) => {
    settle = resolve;
  });

  const stop = firestore.onSnapshot(
    firestore.collection(l.store, pathOf(journalId, kind)),
    async (snap) => {
      // our own write coming back is not news
      if (snap.metadata.hasPendingWrites) return;
      let changed = false;
      for (const change of snap.docChanges()) {
        if (change.type === "removed") continue;
        const value = change.doc.data();
        sent.set(`${kind}/${change.doc.id}`, JSON.stringify(value));
        if (await absorb(value as never)) changed = true;
      }
      useCloud.getState().touched();
      if (changed) announce(await reshelve(journalId));
      settle();
    },
    (err) => {
      useCloud.getState().setPhase("error", explain(err));
      settle();
    },
  );
  return { stop, first };
}

// --- lifecycle -------------------------------------------------------

/** Start syncing in the background. Idempotent. */
export async function startCloud(): Promise<void> {
  stopCloud();
  const config = useCloud.getState().config;
  if (!config || !cloudAvailable()) return;

  try {
    useCloud.getState().setPhase("connecting");
    await ensureSignedIn(config.mode);

    const opened = await Promise.all([
      listen(config.journalId, "pages", absorbPage as never),
      listen(config.journalId, "notebooks", absorbNotebook as never),
      listen(config.journalId, "weekNotes", absorbWeekNote as never),
    ]);
    listeners = opened.map((o) => o.stop);

    // Let what is already up there land before writing anything up. Two
    // reasons: a device joining an existing journal should merge into it
    // rather than push a cold local copy over it, and the first snapshot is
    // what tells us which documents are already identical — without it the
    // whole journal would be rewritten on every single launch.
    await Promise.race([
      Promise.all(opened.map((o) => o.first)),
      new Promise((resolve) => setTimeout(resolve, FIRST_SNAPSHOT_MS)),
    ]);

    pending = null; // the first push is the whole journal
    await push(config.journalId);

    stopWatching = subscribeJournal((key) =>
      schedulePush(config.journalId, key),
    );
    useCloud.getState().touched();
  } catch (err) {
    useCloud.getState().setPhase("error", explain(err));
  }
}

export function stopCloud(): void {
  for (const stop of listeners) stop();
  listeners = [];
  stopWatching?.();
  stopWatching = null;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  pending = null;
  sent.clear();
}

/** Forget this device's pairing. The journal on disk is untouched. */
export async function disconnectCloud(): Promise<void> {
  stopCloud();
  try {
    if (live) {
      const { auth } = await sdk();
      await auth.signOut(live.auth);
    }
  } catch {
    // signing out is a courtesy; the pairing is already gone locally
  }
  useCloud.getState().disconnect();
}

/** Firebase's own errors are written for whoever wired the project up, not
 *  for whoever is holding the phone — "auth/api-key-not-valid" is true and
 *  useless. Each of these is a step in the console that didn't happen, so
 *  say which step rather than quoting the code.
 *
 *  `fresh` means this device made the journal rather than joining one, so a
 *  refusal cannot be a mistyped code and must be the rules. */
export function explain(err: unknown, fresh = false): string {
  const message = err instanceof Error ? err.message : String(err ?? "");
  const code = /\(([a-z]+\/[a-z-]+)\)/i.exec(message)?.[1] ?? "";

  if (
    (typeof navigator !== "undefined" && !navigator.onLine) ||
    /network-request-failed|offline|unavailable/i.test(message + code)
  ) {
    return "Offline — it'll catch up when you're back.";
  }
  if (/api-key-not-valid|invalid-api-key|app-not-authorized/i.test(code)) {
    return "The app's connection details are wrong or incomplete — sync can't be set up from this build.";
  }
  if (/operation-not-allowed|admin-restricted-operation/i.test(code)) {
    return "This journal's cloud hasn't been told to let devices in yet (anonymous sign-in is switched off).";
  }
  if (/unauthorized-domain/i.test(code)) {
    return "Signing in with Google isn't allowed from this address yet. The pairing code works regardless.";
  }
  if (/permission|insufficient|PERMISSION_DENIED/i.test(message)) {
    return fresh
      ? "The cloud refused this journal — its access rules haven't been published yet."
      : "That journal wouldn't open — check the pairing code.";
  }
  if (/popup-closed|popup-blocked|cancelled|user-cancelled/i.test(message)) {
    return "Sign-in was closed before it finished.";
  }
  return message || "Sync failed.";
}
