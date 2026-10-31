# Sync

Two devices, one journal, kept the same without anyone pressing anything.

Sync lives in `src/lib/cloud.ts`, over Firestore.

## What was here before

A polled, AES-encrypted file in a private GitHub gist. It worked, but a
change took up to ninety seconds to appear; it rewrote the whole journal on
every pass, so it got slower as the journal grew; and it needed a GitHub
token, which had to be created, pasted, and recreated whenever it expired
or was regenerated for something else. That last part was the real problem
— a sync you have to set up again is a sync you stop trusting.

It was removed once Firestore was proven on both devices. `git log` has it
if it is ever wanted back.

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

`cloudAvailable()` is false until step 4 is done, and the app is simply
local-first without it: the sync section hides itself and nothing else about
the notebook changes. That is also what a fork of this repo gets until it
points `firebase-config.ts` at a project of its own.

Google sign-in additionally needs the site's domain under Authentication →
Settings → Authorized domains. The pairing code does not — anonymous
sign-in is not domain-scoped — which is one more reason it is the path
offered first.

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
