import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** The sync engine's own bookkeeping, with Firestore stood in for.
 *
 *  What the stand-in can and cannot show matters. It cannot show that the
 *  paths are right, that the security rules hold, or that a write actually
 *  reaches another device — those are properties of Firestore, and
 *  `scripts/emulator-check.mjs` proves them against the real thing.
 *
 *  What it can show is every decision this file makes on its own: that a
 *  device joining an existing journal merges into it instead of pushing a
 *  cold local copy over it, that editing one page writes one document
 *  rather than re-reading the whole journal, that a write coming back to us
 *  costs nothing, and that work isn't dropped when a push fails. Those are
 *  the parts that were wrong at some point while this was written. */

// --- Firestore, as far as this file is concerned ----------------------

interface Watcher {
  path: string;
  onNext: (snap: Snap) => void;
}
interface Change {
  type: "added" | "modified" | "removed";
  doc: { id: string; data: () => unknown };
}
interface Snap {
  metadata: { hasPendingWrites: boolean };
  docChanges: () => Change[];
}

const world = new Map<string, Map<string, unknown>>();
const watchers = new Set<Watcher>();
/** every document write the engine asked for, in order */
let written: string[] = [];
let failNextCommit = false;

function snapshot(changes: Change[], pending = false): Snap {
  return {
    metadata: { hasPendingWrites: pending },
    docChanges: () => changes,
  };
}

function deliver(path: string, ids: string[], pending: boolean): void {
  const bucket = world.get(path);
  const changes: Change[] = ids.map((id) => ({
    type: "modified",
    doc: { id, data: () => structuredClone(bucket?.get(id)) },
  }));
  for (const w of watchers) {
    if (w.path === path) w.onNext(snapshot(changes, pending));
  }
}

/** Put a document into the shared world as if another device had written
 *  it — the only way a test can play the part of a second device. */
function remoteWrite(path: string, id: string, value: unknown): void {
  let bucket = world.get(path);
  if (!bucket) world.set(path, (bucket = new Map()));
  bucket.set(id, structuredClone(value));
  deliver(path, [id], false);
}

// a project is configured and we are not on the emulator: without this the
// engine correctly refuses to start, since there would be nothing to talk to
vi.mock("@/lib/firebase-config", () => ({
  firebaseConfig: { apiKey: "test-key", projectId: "test-project" },
  activeConfig: () => ({ apiKey: "test-key", projectId: "test-project" }),
  usingEmulator: () => false,
  cloudAvailable: () => true,
}));

// zustand's persist wants somewhere to put things
const store = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

// Just enough of a window for the "something arrived" event to have
// somewhere to go. Not a DOM — `document` stays undefined, so nothing else
// mistakes this for a browser — but it does have to carry the storage,
// since that is where anything looking for `localStorage` will now find it.
const windowStub = Object.assign(new EventTarget(), {
  localStorage: localStorageStub,
});

for (const [name, value] of [
  ["window", windowStub],
  ["localStorage", localStorageStub],
] as const) {
  Object.defineProperty(globalThis, name, { configurable: true, value });
}

vi.mock("firebase/app", () => ({
  getApps: () => [],
  getApp: () => ({}),
  initializeApp: () => ({}),
}));

vi.mock("firebase/auth", () => ({
  getAuth: () => ({ currentUser: { uid: "device-1" } }),
  connectAuthEmulator: () => {},
  signInAnonymously: async () => ({ user: { uid: "device-1" } }),
  onAuthStateChanged: () => () => {},
  signOut: async () => {},
  GoogleAuthProvider: class {},
  signInWithPopup: async () => ({ user: { uid: "u", email: "a@b.c" } }),
  signInWithRedirect: async () => {},
  getRedirectResult: async () => null,
}));

vi.mock("firebase/firestore", () => ({
  initializeFirestore: () => ({}),
  getFirestore: () => ({}),
  connectFirestoreEmulator: () => {},
  collection: (_store: unknown, path: string) => ({ path }),
  doc: (_store: unknown, path: string, id: string) => ({ path, id }),
  onSnapshot: (
    ref: { path: string },
    onNext: (snap: Snap) => void,
    _onError: (err: unknown) => void,
  ) => {
    const w: Watcher = { path: ref.path, onNext };
    watchers.add(w);
    // the first snapshot: everything already up there, as "added"
    const bucket = world.get(ref.path);
    const changes: Change[] = [...(bucket ?? new Map())].map(([id, value]) => ({
      type: "added" as const,
      doc: { id, data: () => structuredClone(value) },
    }));
    // a real first snapshot costs a network hop. Delivering it in a
    // microtask would let the engine win races it has no right to win.
    setTimeout(() => onNext(snapshot(changes)), 25);
    return () => watchers.delete(w);
  },
  deleteDoc: async (ref: { path: string; id: string }) => {
    world.get(ref.path)?.delete(ref.id);
  },
  writeBatch: () => {
    const queued: Array<[string, string, unknown]> = [];
    return {
      set: (ref: { path: string; id: string }, value: unknown) =>
        queued.push([ref.path, ref.id, value]),
      commit: async () => {
        if (failNextCommit) {
          failNextCommit = false;
          throw new Error("commit failed");
        }
        for (const [path, id, value] of queued) {
          written.push(`${path}/${id}`);
          let bucket = world.get(path);
          if (!bucket) world.set(path, (bucket = new Map()));
          bucket.set(id, structuredClone(value));
        }
        // our own write comes back to us pending, then settled
        for (const [path, id] of queued) deliver(path, [id], true);
        for (const [path, id] of queued) deliver(path, [id], false);
      },
    };
  },
}));

const { db, pageId } = await import("@/lib/db");
type Page = import("@/lib/db").Page;
const { writeLines, reprime } = await import("@/lib/pageStore");
const { useCloud } = await import("@/state/cloud");
const { useSession } = await import("@/state/session");
const { newPairingCode, readPairingCode, spacedCode, startCloud, stopCloud } =
  await import("@/lib/cloud");

/** how many times the engine read every page in the journal */
let fullScans = 0;
const realToArray = db.pages.toArray.bind(db.pages);
vi.spyOn(db.pages, "toArray").mockImplementation(((...args: never[]) => {
  fullScans++;
  return realToArray(...(args as []));
}) as typeof db.pages.toArray);

const JOURNAL = "c" + "0".repeat(32);
const NB = "nb1";
const DAY = "2026-10-31";

/** the engine debounces its pushes; this is how long a test has to wait */
const settle = (ms = 900) => new Promise((r) => setTimeout(r, ms));

async function seed(): Promise<void> {
  await db.notebooks.put({
    id: NB,
    title: "Journal",
    cover: "oxblood",
    paper: "cream-lined",
    order: 0,
    createdAt: 1,
  });
}

beforeEach(async () => {
  stopCloud();
  watchers.clear();
  world.clear();
  written = [];
  fullScans = 0;
  failNextCommit = false;
  await db.pages.clear();
  await db.notebooks.clear();
  await db.weekNotes.clear();
  useCloud.setState({ config: null, phase: "off", error: null, lastAt: null });
  await seed();
});

describe("pairing codes", () => {
  it("round-trip through the form they're shown in", () => {
    const code = newPairingCode();
    expect(readPairingCode(spacedCode(code))).toBe(code);
  });

  it("survive the way a code actually gets retyped", () => {
    const code = newPairingCode();
    const mangled = ` ${spacedCode(code).toUpperCase().replace(/ /g, "-")}\n`;
    expect(readPairingCode(mangled)).toBe(code);
  });

  it("are refused when they aren't one", () => {
    expect(() => readPairingCode("hello")).toThrow(/pairing code/);
    // a Google journal is named by an account id — it is not a code, and
    // pasting one must not look like it joined
    expect(() => readPairingCode("abc123DEF456")).toThrow(/pairing code/);
    expect(() => readPairingCode(newPairingCode().slice(0, 20))).toThrow();
  });

  it("are long enough to be worth nothing to a guesser", () => {
    const codes = new Set(Array.from({ length: 200 }, newPairingCode));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^c[0-9a-f]{32}$/);
  });
});

describe("joining a journal that already has something in it", () => {
  it("merges into it rather than pushing a cold copy over it", async () => {
    // what the other device has already put up there
    remoteWrite(`journals/${JOURNAL}/pages`, pageId(NB, DAY), {
      id: pageId(NB, DAY),
      notebookId: NB,
      date: DAY,
      updatedAt: 10,
      lines: [
        { id: "theirs", kind: "task", text: "Pay the gas", editedAt: 10 },
      ],
    });

    // what this device has, written before it ever paired
    await db.pages.put({
      id: pageId(NB, DAY),
      notebookId: NB,
      date: DAY,
      updatedAt: 5,
      lines: [{ id: "mine", kind: "task", text: "Call the vet", editedAt: 5 }],
    });

    useCloud.getState().connect({ mode: "code", journalId: JOURNAL });
    await startCloud();
    await settle();

    const page = await db.pages.get(pageId(NB, DAY));
    const texts = page!.lines.map((l) => l.text).sort();
    expect(texts).toEqual(["Call the vet", "Pay the gas"]);

    // and the union went back up, so the other device learns our half
    const remote = world
      .get(`journals/${JOURNAL}/pages`)!
      .get(pageId(NB, DAY)) as { lines: Array<{ text: string }> };
    expect(remote.lines.map((l) => l.text).sort()).toEqual([
      "Call the vet",
      "Pay the gas",
    ]);
  });
});

describe("two devices that each seeded their own notebook", () => {
  it("adopts the one with writing in it and bins the empty seed", async () => {
    // This is what pairing actually looks like: both devices made
    // themselves a "Journal" on first run, before either knew the other
    // existed. Without this, the journal arrives and the second device
    // carries on showing its own empty notebook beside it — which reads,
    // from the outside, as sync simply not working.
    const THEIRS = "nb-theirs";
    remoteWrite(`journals/${JOURNAL}/notebooks`, THEIRS, {
      id: THEIRS,
      title: "Journal",
      cover: "oxblood",
      paper: "cream-lined",
      order: 0,
      createdAt: 1,
    });
    remoteWrite(`journals/${JOURNAL}/pages`, `${THEIRS}__${DAY}`, {
      id: `${THEIRS}__${DAY}`,
      notebookId: THEIRS,
      date: DAY,
      updatedAt: 10,
      lines: [{ id: "t1", kind: "task", text: "Their task", editedAt: 10 }],
    });

    // this device is looking at its own untouched seed, and has already
    // put it up there — which is what makes binning it locally not enough
    remoteWrite(`journals/${JOURNAL}/notebooks`, NB, {
      id: NB,
      title: "Journal",
      cover: "oxblood",
      paper: "cream-lined",
      order: 0,
      createdAt: 1,
    });
    useSession.setState({ notebookId: NB });

    const adopted: Array<string | null> = [];
    const onPulled = (e: Event) =>
      adopted.push(
        (e as CustomEvent<{ adopt: string | null }>).detail?.adopt ?? null,
      );
    window.addEventListener("marginalia:pulled", onPulled);

    useCloud.getState().connect({ mode: "code", journalId: JOURNAL });
    await startCloud();
    await settle();
    window.removeEventListener("marginalia:pulled", onPulled);

    expect(adopted).toContain(THEIRS);
    expect(await db.notebooks.get(NB)).toBeUndefined();
    expect(await db.notebooks.get(THEIRS)).toBeDefined();
    // and the seed is gone from the cloud too, or it would come back on
    // the next connection and the shelf would grow a ghost every launch
    expect(world.get(`journals/${JOURNAL}/notebooks`)?.has(NB)).toBe(false);
  });
});

describe("what one edit costs", () => {
  it("writes the page you touched, not the journal", async () => {
    // a journal with some history in it
    for (const d of ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]) {
      await db.pages.put({
        id: pageId(NB, d),
        notebookId: NB,
        date: d,
        updatedAt: 1,
        lines: [{ id: `l-${d}`, kind: "note", text: d, editedAt: 1 }],
      });
    }

    useCloud.getState().connect({ mode: "code", journalId: JOURNAL });
    await startCloud();
    await settle();
    console.log(
      "PHASE",
      useCloud.getState().phase,
      useCloud.getState().error,
      "written",
      written,
    );

    // the first upload is the whole journal — that part is expected
    expect(written.length).toBe(5); // four pages and the notebook
    expect(fullScans).toBe(1); // read once, as a first upload must
    written = [];
    fullScans = 0;

    await reprime();
    writeLines(NB, DAY, [
      { id: "fresh", kind: "task", text: "Bread", indent: 0 },
    ]);
    await settle();

    expect(written).toEqual([`journals/${JOURNAL}/pages/${pageId(NB, DAY)}`]);
    // and it got there without reading the other four pages
    expect(fullScans).toBe(0);
  });

  it("doesn't restamp lines a save left alone", async () => {
    // Why this matters: a line's `editedAt` is what decides a merge. If
    // saving a page restamped lines it didn't change, every save would
    // look newer than the other device's copy, and the two would take
    // turns overwriting each other — which is what reshuffling feels like
    // from the outside.
    useCloud.getState().connect({ mode: "code", journalId: JOURNAL });
    await startCloud();
    await settle();

    await reprime();
    writeLines(NB, DAY, [
      { id: "a", kind: "task", text: "Same", indent: 0 },
      { id: "b", kind: "task", text: "Also same", indent: 0 },
    ]);
    await settle();
    const first = structuredClone(
      (world.get(`journals/${JOURNAL}/pages`)!.get(pageId(NB, DAY)) as Page)
        .lines,
    );

    // one line changes; the other must come back untouched. The lines go
    // back in the way the page itself passes them — carrying the stamps
    // they already have — because that is the only way they are ever saved.
    const held = (await db.pages.get(pageId(NB, DAY)))!.lines;
    writeLines(
      NB,
      DAY,
      held.map((l) => (l.id === "b" ? { ...l, text: "Edited now" } : l)),
    );
    await settle();
    const second = (
      world.get(`journals/${JOURNAL}/pages`)!.get(pageId(NB, DAY)) as Page
    ).lines;

    expect(second.find((l) => l.id === "a")).toEqual(
      first.find((l) => l.id === "a"),
    );
    expect(second.find((l) => l.id === "b")!.editedAt).toBeGreaterThan(
      first.find((l) => l.id === "b")!.editedAt!,
    );
  });

  it("doesn't echo a change that arrived from the other device", async () => {
    useCloud.getState().connect({ mode: "code", journalId: JOURNAL });
    await startCloud();
    await settle();
    written = [];

    remoteWrite(`journals/${JOURNAL}/pages`, pageId(NB, DAY), {
      id: pageId(NB, DAY),
      notebookId: NB,
      date: DAY,
      updatedAt: 99,
      lines: [{ id: "x", kind: "task", text: "From the phone", editedAt: 99 }],
    });
    await settle();

    const page = await db.pages.get(pageId(NB, DAY));
    expect(page!.lines[0].text).toBe("From the phone");

    // Taking it in must not bounce it straight back up. This is the step
    // that makes that a real risk: absorbing writes to storage behind the
    // page cache's back, so the app reloads the cache — and that reload
    // looks exactly like a local edit to anything watching the journal.
    await reprime();
    await settle();
    expect(written).toEqual([]);
  });
});

describe("when a push fails", () => {
  it("tries that page again instead of leaving it behind", async () => {
    useCloud.getState().connect({ mode: "code", journalId: JOURNAL });
    await startCloud();
    await settle();
    written = [];

    await reprime();
    failNextCommit = true;
    writeLines(NB, DAY, [
      { id: "lost?", kind: "task", text: "Dentist", indent: 0 },
    ]);
    await settle();
    expect(written).toEqual([]); // the commit threw

    // the next edit anywhere must carry the dropped page up with it
    writeLines(NB, "2026-11-01", [
      { id: "other", kind: "note", text: "Later", indent: 0 },
    ]);
    await settle();

    expect(written).toContain(`journals/${JOURNAL}/pages/${pageId(NB, DAY)}`);
  });
});
