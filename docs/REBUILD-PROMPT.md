# Marginalia — build prompt

Paste this into a fresh session to build the app from scratch. It is self-contained.

It describes **the app as it actually stands**, not an aspiration: every feature below
is built and deployed. Where something was tried and abandoned, it says so, because the
abandoned version is usually the obvious one.

There is a far longer companion to this — every colour token, every measurement, every
keyboard binding — at https://claude.ai/artifact/SB1mKguYVPk8ghqJrEM28w. Read this one
to know *what to build and why*; read that one when you need a number.

---

Build **Marginalia**, a journaling + to-do + smart-calendar app whose entire UI is a
skeuomorphic leather notebook: you flip pages with your hand, it looks and moves like
paper, and it holds a *small* set of genuinely smart planning features. I have used
physical leather journals for years and love the feeling — that feeling is the product.
Do not sacrifice it for features.

## The one principle

**The page always looks analog. The intelligence lives in the margins, the
transitions, and what happens while I'm not looking.** A paper journal can't search
itself, can't nudge me, can't carry an unfinished task to tomorrow — those are the only
reasons this is software. But the smart parts must feel like the notebook quietly did
them, never like an app was bolted onto a photo of paper. If a feature needs a
settings-heavy panel, a modal stack, or a notifications-centre feel, cut it or hide it.

## Platforms & stack

- **iPhone, iPad, PC, all synced.** Web-first PWA. Vite + React + TypeScript.
  Developed on Windows.
- **Local-first storage** — IndexedDB (Dexie). Everything works fully offline; sync is
  a transport bolted onto a journal that is already whole on each device, never the
  source of truth.
- **State**: Zustand for session/overlay/quick-add. **Gestures**: `@use-gesture/react`.
  **Page turn**: WebGL. **Sync**: Firebase (Firestore + anonymous auth), lazily
  imported. **Tests**: Vitest. **PWA**: vite-plugin-pwa.
- **Deploy to GitHub Pages** from `main` via Actions. Vite `base` must be
  `/Paper-Journal/` under `GITHUB_ACTIONS`, `/` locally; PWA manifest paths relative.
- `npm run check` is typecheck + lint + test. It does **not** include `format:check`,
  which CI runs separately — so running `check` alone and pushing fails CI on
  formatting. Run both.
- **Minimal dependencies.** The paper aesthetic is hand-built CSS/Canvas, not a UI kit.
- Fonts are **self-hosted** woff2 subsets. No request leaves the device to render a page.

## Look & feel — this is the whole point, spend real care here

**Palette**: `--paper #F2F0E6` · `--ink #23262D` (blue-black) · `--oxblood #7A2E38` ·
`--brass #8F7145` (gilding/rules) · `--thread #3C5A44` (done/positive) ·
`--rule #B8544E` (the red margin line). **Dark mode = the notebook by lamplight** —
warm dark browns, never pure black; keep the ink readable. Define tokens on `:root`,
redefine under `@media (prefers-color-scheme: dark)` guarded by
`:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]` so a
manual override wins.

**Type**: a characterful bookish serif for date headers (Fraunces), a comfortable serif
for the writing (Newsreader), a mono for signifiers and small labels (JetBrains Mono).

**Materials**: leather cover — oxblood default, plus tan, forest, black cloth; cream
lined / dot-grid / blank paper per notebook; a ribbon bookmark; a red margin rule down
every page. The book sits on a "desk" surface with a soft vignette.

**Not this**: the generic "AI startup" look (warm-cream + lone serif + terracotta;
purple gradient hero; everything centred and `rounded-lg`). This is a bound book, not a
landing page.

## The page turn — the make-or-break interaction

Budget serious effort here. If this feels wrong, nothing else matters.

- **Opening**: tap or swipe the cover → it flips open around the spine in 3D.
- **Turning follows the finger 1:1**, then spring physics on release, decided by *how
  far* you dragged **and** fling velocity.
- **Turning is a swipe, never a tap.** Tapping the paper puts the cursor where you
  tapped. A stray tap that jumps you to tomorrow mid-sentence is the most annoying
  thing a notebook can do.
- **The paper must not read as a rigid flat card rotating.** The sheet lifts and arcs
  off the spine, bows as it flexes, catches a moving highlight, and casts a shadow on
  the page beneath. Use **WebGL** and deform real geometry.
- **The turning page must never disappear.** (A naive CSS 3D setup depth-sorts the
  turning leaf *behind* the page underneath past vertical, and it vanishes. Own
  perspective + flat context, or go Canvas and sidestep it.)
- **Performance**: write transforms straight to the DOM/canvas — never React state per
  frame.
- Also support arrow keys and a month grid. Respect `prefers-reduced-motion`.
- `html`/`body` get `touch-action: none` and `overscroll-behavior: none`, but the
  **scrollable page body must opt back in to vertical panning**, or the phone stops
  scrolling the writing and drags the whole page instead.

## Rapid logging

A signifier at the start of a line, stripped on entry, setting the line's kind:
`-` task · `x` done · `o` event · `>` moved · `*` priority · `~` idea · plain = note.

There is no separate `done` kind in the model — done is a task with a strike time, so
unticking is lossless and the legacy kind is normalised away on read.

Keys: `⌘/Ctrl+Enter` ticks · `Alt+Enter` cycles the kind (task → priority → event →
idea → note) · `Tab`/`Shift+Tab` indents one level · `Alt+↑/↓` moves a line ·
`⌫` on empty removes · `↑/↓` moves the cursor between lines · `⌘/Ctrl+F` or bare `/`
opens search.

**One level of indent only.** An indented line belongs to the unindented line above it.
That is the whole hierarchy, and it is deliberate — a notebook does not nest five deep.

**A heading carries its block.** Moving a parent to another day, or dragging it to
reorder, takes its indented children with it. This is the unit the app calls a *group*,
and it applies to both kinds of move. Getting this wrong — moving the parent alone —
makes the feature feel broken in a way that is hard to name.

## Three different kinds of "later"

This distinction is the heart of the planning layer. Do not collapse them.

| | means | where it shows |
|---|---|---|
| **Filed for a day** | "do it then" | moves to that page, `›` breadcrumb left behind |
| **A deadline** | "it answers to this date" | stays put, chip counts down, appears in Coming Up |
| **Someday** | "I don't know when" | vanishes from the notebook; lives only in Open Loops |

A task can have both a deadline and a someday — the deadline still surfaces in Coming
Up even though the line is nowhere in the notebook. That combination sounds odd and is
exactly what people want: "this matters by Friday, but I'm not scheduling it."

Deadline urgencies: `late` (past) · `today` · `close` (≤2 days) · `soon` (≤7) ·
`later`. The chip reads relatively (`3d`, `tomorrow`, `2 days late`).

**Events can be moved by hand but are never carried automatically.** A meeting that
didn't happen didn't move to tomorrow — it just didn't happen.

## Rollover

Every unfinished task is carried to today each morning, drawn `›`. There is **one live
copy**: the task moves, leaving a breadcrumb (`carriedTo`) on the day it left. Every
copy shares **one line id** — which is what lets the weekly tally count a four-times-
carried task as one completion rather than four.

The nag ladder is typographic, driven by a roll count, and **caps** (`NAG_CAP = 4`).
Past the cap it stops shouting; a notebook that screams at you is one you stop opening.

Notes, ideas, events, struck tasks and breadcrumbs are **not** carried.

## The weekly focus

A few lines at the top of the week — "Gym x3", "finish the deck" — with a tally beside
each one counting how many *finished* tasks this week share a word with it. Stop-words
are excluded. Counting is **by line id**, not by struck line, or a carried task scores
once per day it was carried.

The row is kept even when you clear every line: a deleted row has no timestamp for the
merge to compare, so the next sync can't tell "I cleared this" from "I never had it"
and puts the old text back. An empty row with a fresh timestamp is the tombstone.

## Coming Up

A standing panel at the foot of today's page: everything with a deadline, nearest
first. This is the one place the notebook volunteers something you didn't ask for.

## Sync

Over Firestore, free tier. **It changes how a change travels and nothing about how two
edits are settled.**

Getting in is a **pairing code** first and a Google account second. Turn sync on and
the first device mints a code — 128 bits of randomness, the journal id *is* the secret
— and the second device signs in anonymously and joins with it. Google sign-in is
offered in smaller type, because inside a home-screen app on iOS the popup is sandboxed
from the app that opened it and the redirect has its own ways of hanging. The code
cannot fail that way, and it never expires.

The predecessor was a polled, AES-encrypted file in a private GitHub gist. It needed a
token that had to be remade whenever it lapsed, and **a sync you have to set up again
is a sync you stop trusting**. If you are tempted by the gist, that is the reason not
to be.

### How a merge resolves

Per line, not per page, on **two independent clocks**:

- `editedAt` decides what a line *says*
- `orderedAt` decides where it *sits*

So editing a line on one device and dragging it on the other keeps both the new words
and the new position. Collapsing these into one timestamp is the single most tempting
mistake here, and it makes the page reshuffle itself seconds after you write on it.

Every line also carries an `order` on one shared fractional scale (`ORDER_GAP = 1000`),
filled in at write time for any line that lacks one by interpolating between its
defined neighbours. A deletion is a **tombstone** — an empty line with a time — so it
competes on equal terms rather than being silently undone by the other device.

Hold this to **randomised invariant tests**: a merge against a stale remote must return
*exactly* the local order, over hundreds of random drag/edit/delete sequences. This is
not over-testing; three separate ordering bugs shipped before that test existed.

## Notebooks

One book by default; a shelf of spines for streams. Each has its own cover and paper.
One shared "today" across all books. Search is global.

## Architecture

- One module owns page data (load / save / cache / subscribe). The UI never touches
  storage directly. All writes funnel through a single choke point that stamps edits,
  assigns positions and records tombstones — **every bug where a deletion came back was
  a write that bypassed it**.
- Export is first-class: JSON (round-trips exactly) and Markdown, any time. Import
  merges; importing the same file twice is a no-op.

## Pitfalls — all of these actually happened

**Page turn**
- react-spring v9's imperative `SpringRef` detaches from its live `SpringValue` under
  StrictMode + Vite HMR; animations freeze at their start value. Hand-roll a
  time-based spring integrator instead.
- Naive CSS 3D flip → the turning leaf is occluded past 90° and vanishes.

**Ordering** (three separate shipped bugs)
- Don't mint positions from `Date.now()`: new lines land on a different numeric scale
  from migrated ones (~1.79e12 vs 0–10000) and always sort to the top.
- Don't mix absolute `order` values with live array indices. Indices shift on insert
  and delete; fixed orders don't; lines cross.
- When reordering, build neighbour keys from the **pre-splice** array. Post-splice
  indices point at the wrong lines.
- Clear a dragged line's `order` and let the write path re-derive it, rather than
  computing one at drag time.

**React**
- Never call a store write inside a `setState` updater — that is a render-phase write,
  and StrictMode will run it twice. Keep drag state in a ref and commit on release.
- The "adjust state during render" pattern (compare previous value, `setState`) is the
  right way to reset derived state; a ref will be rejected by `react-hooks/refs`.
- A memoised blank row can collide with a real line that has adopted its id, and typing
  then silently overwrites the earlier line.

**Firestore**
- It **rejects an `undefined` field value** rather than treating the field as absent.
  A just-dragged line carries no position, so the first drag after turning sync on kills
  sync silently. Set `ignoreUndefinedProperties: true`.
- Let the first snapshot land *before* the first push, or every launch re-uploads the
  whole journal and a joining device can push a cold local copy over a live one.
- Both devices seeded themselves a notebook before either knew the other existed, so
  after pairing the second device shows its own empty one beside the journal that just
  arrived — indistinguishable, from the outside, from sync not working. Reconcile the
  shelf on arrival, and delete the binned seed **in the cloud too** or it returns on the
  next connection.

**Tooling**
- npm 11 blocks postinstall scripts by default — add an `allowScripts` entry for
  `esbuild`. On Windows run npm from PowerShell, not Git Bash.
- `npm run check` excludes `format:check`. CI runs it. Run both before pushing.

## How to know it works

Unit tests are necessary and not sufficient here. Two things caught more real bugs than
anything else:

1. **Randomised invariant tests** over the merge and ordering rules.
2. **Driving the actual app in a real browser** — two browser contexts, paired, typing
   in one and watching the other. Every sync bug above was found this way and none of
   them by a unit test.

And: after writing a test, **check that it fails against the unfixed code.** Three of
the first sync tests passed with the fix removed and were proving nothing.

## Priority order

1. The notebook **opening** and the **page-turn feeling genuinely like paper**.
2. The **daily page** + **rapid logging** + **local persistence** that survives reload.
3. Rollover, then the three kinds of "later", then sync.

Deliver a working PWA deployed to GitHub Pages that opens on iPhone, iPad and PC.
