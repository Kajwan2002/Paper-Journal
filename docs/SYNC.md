# Sync

Two devices, one journal, kept the same without anyone pressing anything.

There are two sync transports in the tree. The newer one, over Firestore
(`src/lib/cloud.ts`), is the one to use. The older one, over a private
GitHub gist (`src/lib/sync.ts`), is kept only so that a device already
paired through it keeps working; it hides its own setup once the new one is
configured, and can be deleted once nothing is on it.

## Why it was replaced

The gist sync worked, but it was polled rather than pushed, so a change took
up to ninety seconds to appear; it rewrote the whole journal on every pass,
so it got slower as the journal grew; and it needed a GitHub token, which
has to be created, pasted, and recreated whenever it expires or is
regenerated for something else. That last part was the real problem — a
sync you have to set up again is a sync you stop trusting.

Firestore holds an open connection, so a change lands in about a second;
only the page you touched is written; and a pairing code never expires.

## What it does not change

Nothing about how two edits are settled. Pages still merge per line, by
`editedAt` for what a line says and `orderedAt` for where it sits — see
`src/lib/merge.ts`. Firestore decides _when_ a change arrives, not who wins.

## Getting in

Two ways, and the order matters.

**A pairing code** is the one offered first. The device signs in
anonymously, which asks nothing of anyone, and the code names which journal
to join. The code _is_ the secret: 128 bits of randomness that only reaches
another device by being typed into it. It does not expire and is never
revoked.

**A Google account** is offered second, in smaller type. It is the nicer
idea — nothing to carry, and you can get back in on a device you have never
paired. But signing in with Google inside a home-screen app on iOS has a
long history of going wrong: the popup is sandboxed away from the app that
opened it, and the redirect has its own ways of hanging. So it is the
alternative, not the headline.

A journal reached by one route cannot be reached by the other, because the
rules scope a Google journal to its account.

## Who can read a journal

`firestore.rules`, and nothing else. There is no server.

    journals/<uid>/...       only the account that signed in
    journals/c<32 hex>/...   any signed-in device that knows the code

Everything else is refused, including every unauthenticated request. The
Firebase web config in `src/lib/firebase-config.ts` is **not** a secret — it
ships inside every copy of the app and is meant to be public. The rules are
what keep a journal private.

## Setting up the project

1. Create a project at <https://console.firebase.google.com>.
2. Build → Firestore Database → Create database → production mode.
3. Build → Authentication → Sign-in method → enable **Anonymous**, and
   **Google** if you want that route too.
4. Project settings → Your apps → Web → register, and copy the config
   object into `src/lib/firebase-config.ts`.
5. Publish the rules in `firestore.rules` (console → Firestore → Rules, or
   `npx firebase deploy --only firestore:rules`).

Until step 4 is done, `cloudAvailable()` is false and the app behaves
exactly as it did before: local-first, with the gist sync still available.
Nothing about the notebook depends on any of this being set.

## Testing it

`src/lib/cloud.test.ts` runs in `npm test` and covers the engine's own
decisions, with Firestore stood in for: joining merges rather than
overwrites, one edit writes one document, an arriving change is not echoed
back, a failed push is retried.

The half a stand-in cannot cover — the paths, the rules, realtime delivery,
and the fact that Firestore rejects an `undefined` field value unless asked
not to — needs the emulator:

    npx firebase emulators:start --project demo-marginalia   # one terminal
    node scripts/emulator-check.mjs                          # another

With the emulator up, `npm run dev` on `localhost` talks to it rather than
to a real project, so two browser profiles can be paired and watched.
