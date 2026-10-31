/* Two devices, one journal, against the real Firestore — the emulator.
 *
 * `src/lib/cloud.test.ts` covers the engine's own decisions with Firestore
 * stood in for. This covers the half a stand-in cannot: that the document
 * paths work, that realtime delivery between two separate clients actually
 * happens, that `firestore.rules` lets the right things through and refuses
 * the rest, and that a line carrying `order: undefined` — which every
 * dragged line does, until the next write fills it in — goes up without
 * throwing.
 *
 * It needs the emulator suite, so it is not part of `npm test`. To run it:
 *
 *   npx firebase emulators:start --project demo-marginalia   # one terminal
 *   node scripts/emulator-check.mjs                          # another
 */
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInAnonymously } from "firebase/auth";
import {
  initializeFirestore,
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  getDoc,
  collection,
  onSnapshot,
} from "firebase/firestore";

const CONFIG = { apiKey: "demo-key", projectId: "demo-marginalia" };
let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(
    `${ok ? "  ok  " : " FAIL "} ${label}${detail ? " — " + detail : ""}`,
  );
  if (!ok) failures++;
};

async function device(name, { ignoreUndefined = true } = {}) {
  const app = initializeApp(CONFIG, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const store = ignoreUndefined
    ? initializeFirestore(app, { ignoreUndefinedProperties: true })
    : getFirestore(app);
  connectFirestoreEmulator(store, "127.0.0.1", 8080);
  const cred = await signInAnonymously(auth);
  return { app, store, uid: cred.user.uid };
}

const code = "c" + "a1b2c3d4e5f60718293a4b5c6d7e8f90".slice(0, 32);
const pc = await device("pc");
const phone = await device("phone");
console.log(
  `two devices signed in anonymously (different uids: ${pc.uid !== phone.uid})`,
);

// --- realtime between two devices ------------------------------------
const seen = [];
const stop = onSnapshot(
  collection(phone.store, `journals/${code}/pages`),
  (snap) => {
    for (const c of snap.docChanges()) {
      if (c.type !== "removed") seen.push(c.doc.data());
    }
  },
);

const page = {
  id: "nb__2026-10-31",
  notebookId: "nb",
  date: "2026-10-31",
  updatedAt: Date.now(),
  lines: [
    {
      id: "l1",
      kind: "task",
      text: "Breakfast",
      indent: 0,
      order: 0,
      orderedAt: 1,
    },
    {
      id: "l2",
      kind: "event",
      text: "dentist",
      indent: 0,
      order: 1000,
      orderedAt: 1,
    },
  ],
};

const t0 = Date.now();
await setDoc(doc(pc.store, `journals/${code}/pages`, page.id), page);

await new Promise((resolve) => {
  const started = Date.now();
  const tick = setInterval(() => {
    if (seen.some((p) => p.id === page.id) || Date.now() - started > 10000) {
      clearInterval(tick);
      resolve();
    }
  }, 50);
});
const landed = seen.find((p) => p.id === page.id);
check(
  !!landed,
  "a page written on the pc reaches the phone",
  landed ? `${Date.now() - t0}ms` : "never arrived",
);
check(landed?.lines?.length === 2, "its lines survive the trip intact");
check(landed?.lines?.[1]?.kind === "event", "and so do their kinds");
stop();

// --- the rules --------------------------------------------------------
// a journal named by one account's uid must not open for another
await setDoc(doc(pc.store, `journals/${pc.uid}/pages`, "p1"), {
  id: "p1",
  lines: [],
});
check(true, "a device can write its own uid-named journal");

let refused = false;
try {
  await getDoc(doc(phone.store, `journals/${pc.uid}/pages`, "p1"));
} catch (err) {
  refused = /permission|insufficient/i.test(String(err));
}
check(refused, "another account cannot read a uid-named journal");

// a code-named journal must refuse an id that isn't a real code
let badRefused = false;
try {
  await setDoc(doc(phone.store, `journals/cNOTACODE/pages`, "p1"), {
    id: "p1",
  });
} catch (err) {
  badRefused = /permission|insufficient/i.test(String(err));
}
check(badRefused, "a malformed journal id is refused");

// --- the fields a dragged line actually carries -----------------------
// A line that has just been moved holds `order: undefined` until the next
// write fills it in, and a task with no deadline simply has no `deadline`.
// Firestore rejects an undefined field value outright rather than treating
// it as absent, so without `ignoreUndefinedProperties` the first drag after
// turning sync on would break it.
const dragged = {
  id: "nb__2026-11-01",
  lines: [
    {
      id: "d1",
      kind: "task",
      text: "Just dragged",
      order: undefined,
      deadline: undefined,
    },
  ],
};

let strictThrew = false;
const strict = await device("strict", { ignoreUndefined: false });
try {
  await setDoc(
    doc(strict.store, `journals/${code}/pages`, dragged.id),
    dragged,
  );
} catch (err) {
  strictThrew = /unsupported field value: undefined/i.test(String(err));
}
check(
  strictThrew,
  "a dragged line is refused outright by default",
  "which is why the setting is there",
);

let lenientOk = false;
try {
  await setDoc(doc(pc.store, `journals/${code}/pages`, dragged.id), dragged);
  lenientOk = true;
} catch (err) {
  console.log("    " + String(err));
}
check(lenientOk, "and goes up fine with ignoreUndefinedProperties");

const back = await getDoc(
  doc(phone.store, `journals/${code}/pages`, dragged.id),
);
const line = back.data()?.lines?.[0];
check(line?.text === "Just dragged", "arriving with its text");
check(
  line && !("order" in line),
  "and the undefined field simply absent, as it should be",
);
await deleteApp(strict.app);

console.log(failures ? `\n${failures} FAILED` : "\nall good");
await Promise.all([deleteApp(pc.app), deleteApp(phone.app)]);
process.exit(failures ? 1 : 0);
