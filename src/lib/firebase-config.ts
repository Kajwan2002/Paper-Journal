/** The Firebase project this app talks to.
 *
 *  These values are not secrets. A Firebase web config ships inside every
 *  copy of the app and is visible to anyone who opens it — that is how it
 *  is designed to work. What keeps a journal private is the security rules
 *  on the project (see `firestore.rules`), not hiding these.
 *
 *  Replace the empty strings with the config from
 *  Firebase console → Project settings → Your apps → Web. */
export const firebaseConfig = {
  apiKey: "AIzaSyAZhFZYq2WZBYm3_0JhyUQyKl5-gB_5fek",
  authDomain: "marginalia-753d2.firebaseapp.com",
  projectId: "marginalia-753d2",
  storageBucket: "marginalia-753d2.firebasestorage.app",
  messagingSenderId: "401195836606",
  appId: "1:401195836606:web:d1a66ca2fbcd8d460aaaef",
};

/** Running against the local emulator suite rather than a real project —
 *  how the sync engine is tested without anyone's account. */
export function usingEmulator(): boolean {
  return (
    typeof location !== "undefined" &&
    (location.hostname === "localhost" || location.hostname === "127.0.0.1") &&
    !firebaseConfig.projectId
  );
}

export function activeConfig() {
  return usingEmulator()
    ? { apiKey: "demo-key", projectId: "demo-marginalia" }
    : firebaseConfig;
}

/** Until the project is filled in, the app runs exactly as it did before:
 *  local-first, with the older GitHub sync still available. Nothing about
 *  the notebook depends on this being set. */
export function cloudAvailable(): boolean {
  return (
    Boolean(firebaseConfig.apiKey && firebaseConfig.projectId) ||
    usingEmulator()
  );
}
