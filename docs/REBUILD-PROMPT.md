# Marginalia — build prompt

Paste this into a fresh session to build the app from scratch. It is self-contained.

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

- **iPhone, iPad, PC — eventually all synced.** Build single-device-excellent first;
  structure the data so a CRDT + end-to-end-encryption sync layer slots on top later
  without a rewrite. Sync is a later phase, not now.
- **Primary input is typing.** Apple Pencil / handwriting is a much later addition.
- **Web-first PWA.** Vite + React + TypeScript. Developed on Windows.
- **Local-first storage** — IndexedDB (Dexie). Everything works fully offline. Keep a
  clean seam between the page-data store and the UI (that seam is where sync plugs in).
- **Deploy to GitHub Pages** from `main` via an Actions workflow. Repo is
  `Kajwan2002/Paper-Journal` (public). Vite `base` must be `/Paper-Journal/` under
  `GITHUB_ACTIONS`, `/` locally; make PWA manifest paths relative.
- **Minimal dependencies.** The paper aesthetic is hand-built CSS/Canvas, not a UI kit.

## Look & feel — this is the whole point, spend real care here

**Palette** (starting point, refine it):
`--paper #F2F0E6` · `--ink #23262D` (blue-black) · `--oxblood #7A2E38` ·
`--brass #8F7145` (gilding/rules) · `--thread #3C5A44` (done/positive) ·
`--rule #B8544E` (the red margin line). **Dark mode = the notebook by lamplight** —
warm dark browns, never pure black; keep the ink readable.

**Type**: a characterful bookish serif for date headers (e.g. Fraunces), a comfortable
serif for the writing (e.g. Newsreader), a mono for signifiers and small labels (e.g.
JetBrains Mono). Google Fonts, real fallback stacks.

**Materials**: leather cover — oxblood default, plus tan, forest, black cloth; cream
lined / white dot-grid / blank / graph paper (per notebook); a ribbon bookmark that
hangs from the top; an elastic band closure that stretches shut; optional gilded page
edges that catch light; a red margin rule down every page. The book sits on a "desk"
surface with a soft vignette. Ambient: the cover catches light by time of day —
subtle, switchable off.

**Not this**: the generic "AI startup" look (warm-cream + lone serif + terracotta;
purple gradient hero; everything centred and `rounded-lg`). This is a bound book, not a
landing page.

## The page turn — the make-or-break interaction

Budget serious effort here. If this feels wrong, nothing else matters.

- **Opening**: tap or swipe the cover → it flips open around the spine in 3D,
  revealing today's page. Closing = the elastic band / ribbon, and it auto-saves.
- **Turning follows the finger 1:1.** Drag from the right edge and pull left to go
  forward in time; from the left edge and pull right to go back. The page tracks your
  finger the whole way.
- **On release, spring physics.** It completes the turn or snaps back, decided by *how
  far* you dragged (past ~halfway) **and** fling velocity — a quick flick turns the
  page from an inch in.
- **The paper must not read as a rigid flat card rotating.** The sheet lifts and arcs
  off the spine, bows as it flexes, catches a moving highlight on its curved surface,
  and casts a shadow on the page beneath. Strongly consider a **WebGL/Canvas** page
  that deforms real geometry — a cylindrical bend around the drag point with the page
  content rendered onto it. A layered-CSS fake is acceptable only if it genuinely
  reads as bending paper.
- **The turning page must never disappear.** (A naive CSS 3D setup depth-sorts the
  turning leaf *behind* the page underneath once it passes vertical, and it vanishes.
  Give the turn its own perspective and a flat, non-`preserve-3d` context so it
  composites on top by z-index — or use Canvas and sidestep it.)
- **Performance**: 60fps on a mid iPhone, 120 on a ProMotion iPad. Drive the drag by
  writing transforms straight to the DOM/canvas — never React state per frame.
- Also support: tap the far-left / far-right of the page to turn; arrow keys; and it
  must never hang if the frame loop stalls (tab backgrounded mid-turn).
- Respect `prefers-reduced-motion` (jump straight to the destination page).
- A soft paper sound on the turn — mutable.

## Features — keep the set small; the restraint is the point

**Tier 1 — the core loop**
- **Daily page**: one page per day. Pre-printed weekday + long date, a folio number
  (day of the year), the red margin rule. One flowing bullet-journal list to write in
  (favour this over separate morning/evening boxes). Faint prompt on an empty page.
- **Rapid-logging grammar**: a signifier at the start of a line — `-` task · `x` done
  · `o` event · `>` moved/scheduled · `*` priority · `~` idea · plain text = note. The
  typed prefix is stripped and the line takes that kind. Tapping a task's glyph ticks
  it. Enter = new line (a task Enters into another task; everything else into a note).
  Backspace on an empty line removes it.
- **Task rollover / migration**: an unchecked task from a past day draws a `>` and
  reappears on the next day. Something rolled many times should visibly look nagged.
- **Natural-language capture**: type "gym mon/wed/fri 7am" or "call mum sunday" and it
  quietly becomes a recurring reminder / event — still shown as your text on the line,
  with a hairline underline marking it "live".
- **Real calendar, handwritten**: two-way sync with Google / iCloud / Outlook via
  CalDAV. Appointments appear as ink on a vertical timeline in the margin rail — not a
  grid.
- **Search across every page** — the thing paper can't do. A magnifying-glass ribbon;
  results shown as page-corner peeks you flip straight to.

**Tier 2 — the planning layer**
- Weekly & monthly spreads, auto-populated from daily pages + calendar, still
  hand-editable.
- Margin-rail time-blocking: drag a task onto the day's vertical timeline.
- Habit / mood tracker as a monthly dot grid.
- Collections: tag a line with a symbol and a named collection assembles itself across
  pages (a project, a trip, a reading list) — the Leuchtturm index, automatic.
- "On this day": a ribbon to what you wrote a month or a year ago.

**Tier 3 — gentle intelligence (all opt-in, all in the margin)**
- The assistant is a **pencil in the margin** — a thin right-edge gutter where the app
  writes back in a lighter hand. Not a chat bubble, not a robot.
- **Ambient** (default): writes unprompted only for a few things — a rolled-too-many-
  times task, a scheduling clash, a short end-of-week note ("you moved 'taxes' four
  times this week"). Everything it adds erases with one swipe.
- **Active**: tap the margin and ask ("when am I free for 2 hours this week?", "pull
  every line tagged #book into a list"). It answers in the margin or lays the result on
  a fresh page.
- It **drafts in pencil-grey**; nothing becomes real ink until I tap it. One dial —
  Off / Ambient / Active — not twenty toggles.
- Privacy: journaling is the most sensitive data a person owns. Scope every assistant
  request to what's asked; make plain what leaves the device.

**Deliberately out of scope** (to protect the feel): collaboration / shared notebooks;
project-management boards (no Kanban, Gantt, assignees); a notification firehose (one
gentle daily nudge at most); infinite nested folders; rich media walls (images allowed
sparingly, taped-in-photo style).

## Notebooks model

One book is the default. A **shelf** of spines if I want streams (Journal / Work /
Japan trip). Each notebook has its own cover, paper, ribbons. **One shared "today"
across all books** by default — I live one life. Calendar and search are global;
collections stay inside their notebook unless pinned to the shelf. When a book fills
(~250 spreads) it can be shelved (still searchable) and a new volume opens ("Journal,
Vol. 4").

## Architecture

- Local-first; every device holds the whole notebook and works offline. Opening a page
  is instant because it's already there.
- One clean module owns page data (load / save / cache / subscribe). The UI never
  touches storage directly. This module is the seam for the future CRDT (Automerge or
  Yjs) + end-to-end encryption + thin sync relay.
- **Export is first-class**: a notebook → PDF (as spreads) and → Markdown, any time.
  My writing is never trapped.

## Pitfalls from the previous build — avoid these

- **react-spring v9's imperative `SpringRef` API detaches from its live `SpringValue`
  under React StrictMode + Vite HMR** — animations silently freeze at their start
  value. Don't use it imperatively. A hand-rolled time-based spring integrator
  (~40 lines, sub-stepped for stability) was far more reliable. Declarative
  `useSpring({...})` bound to a prop is fine.
- **Naive CSS 3D page-flip** → the turning leaf is occluded by the page beneath past
  90° and vanishes. Own perspective + flat context, or go Canvas.
- **npm 11 blocks postinstall scripts by default** — add an `allowScripts` entry for
  `esbuild` in package.json. On Windows, run npm from **PowerShell**, not Git Bash
  (the cmd subprocess can't find node on PATH).
- **Vite `base`** must be `/Paper-Journal/` for GitHub Pages; make manifest `start_url`
  / `scope` / icon paths relative (`.` / `./icon.svg`).
- StrictMode is worth keeping — just don't pair it with imperative react-spring.

## Priority order

1. The notebook **opening** and the **page-turn feeling genuinely like paper** — this
   first, and get it right.
2. The **daily page** + **rapid logging** + **local persistence** that survives reload.
3. Notebooks shelf, then the calendar rail, then everything else.

Deliver a working PWA deployed to GitHub Pages that opens on iPhone, iPad and PC.
