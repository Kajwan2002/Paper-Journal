# Marginalia

A planner that looks like a leather journal and thinks like a very organised
assistant. Web‑first PWA — one codebase for iPhone, iPad and PC.

See [`design-brief.html`](design-brief.html) for the full concept, feature tiers
and open decisions. Published: https://claude.ai/code/artifact/9e7c46ef-c96c-4198-abba-6721035727a1

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:5173. On your phone, open the Network URL that Vite
prints (same Wi‑Fi) and "Add to Home Screen" to run it like an app.

```bash
npm run build      # production build into dist/
npm run preview     # serve the production build
npm run typecheck   # tsc, no emit
```

## What works today (increment 1)

- **The leather notebook.** Opens with a page‑flip animation — tap the cover, or
  swipe. Close with the ribbon bookmark.
- **The daily page.** One page per day, pre‑printed date header and folio (day of
  the year). Turn pages by tapping the left/right edge, swiping, or arrow keys.
- **Rapid logging.** Type a signifier at the start of a line:
  `-` task · `x` done · `o` event · `>` moved · `*` priority · `~` idea · (plain) note.
  Tap a task's glyph to tick it off. Enter for a new line; Backspace on an empty
  line removes it.
- **Local‑first storage.** Everything is saved to the browser (IndexedDB via
  Dexie) and restored on reload. Nothing leaves the device yet.

## Not built yet

Sync across devices, the calendar rail, weekly/monthly spreads, collections,
search, the margin assistant, multiple notebooks, handwriting. The storage layer
(`src/lib/pageStore.ts`) is the seam the CRDT + end‑to‑end‑encryption sync will
plug into.

## Stack

Vite · React · TypeScript · Zustand (session state) · Dexie (IndexedDB) ·
@use-gesture (drag/swipe) · CSS transitions & keyframes for the page‑turn.
No component framework — the paper aesthetic is hand‑built CSS.

## Layout

```
src/
  lib/         date helpers, rapid-log grammar, Dexie schema, the page store
  state/       zustand session store (which notebook, which day, open/closed)
  components/  Desk · Book (turn logic) · Cover · DailyPage · RuledLines
  styles/      design tokens (ported from the brief) + global reset
```
