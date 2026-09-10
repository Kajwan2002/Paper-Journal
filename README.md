# Marginalia

A planner that looks like a leather journal and thinks like a very organised
assistant. Web‑first PWA — one codebase for iPhone, iPad and PC.

**Live:** https://kajwan2002.github.io/Paper-Journal/ (auto‑deploys from `main`)

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
npm run build        # production build into dist/
npm run preview      # serve the production build
npm run check        # typecheck + lint + tests, what CI runs
npm test             # vitest
npm run lint         # eslint
npm run format       # prettier --write
npm run fonts        # re-download the self-hosted font subsets
```

## What works today

- **The leather notebook.** Opens with a page‑flip animation — tap the cover, or
  swipe. Close with the ribbon bookmark.
- **The daily page.** One page per day, pre‑printed date header and folio (day of
  the year).
- **Turning pages is a swipe, never a tap.** Drag anywhere on the page and the
  leaf follows your finger; a spring finishes the turn or snaps it back
  depending on how far and how fast you flung it. Arrow keys and the month grid
  work too. Tapping the paper puts the cursor where you tapped — it never turns
  the page, because a stray tap that jumps you to tomorrow mid‑sentence is the
  most annoying thing a notebook can do.
- **Rapid logging.** Type a signifier at the start of a line:
  `-` task · `x` done · `o` event · `>` moved · `*` priority · `~` idea · (plain) note.
  Tap a line's glyph to tick it off, or `⌘/Ctrl+Enter` without leaving the
  keyboard. `Tab` indents one level, `Alt+↑/↓` moves a line, `⌫` on an empty
  line removes it, and every line has a `⋯` menu for moving, parking and
  deleting.
- **Quiet scheduling.** Write "call mum friday" on a task and the notebook files
  it for Friday and takes the word out of the line. Nothing is scheduled until
  you press Enter or leave the line, so the text never rearranges under the
  cursor. Only the end of a task‑ish line counts, so "friday night lights" is
  left alone.
- **Task rollover.** Anything unfinished is carried to today each morning,
  drawn as `›`, with a permanent breadcrumb on the day it left. There is only
  ever one live copy. A task keeps a count of the mornings it has been carried
  and the page nags harder the longer you leave it — up to a point.
- **Open loops.** One ribbon shows every unfinished commitment in the notebook,
  grouped into what is asking for you now, what is filed for later, and
  someday. Tick things off or park them without leaving the list.
- **Search.** `⌘/Ctrl+F` or `/`. Filter by kind — every `★` you never finished,
  every event, every idea.
- **A year ago.** The foot of each page quietly shows what you wrote on that day
  last year, if you wrote anything.
- **Local‑first storage.** Everything is saved to the browser (IndexedDB via
  Dexie) and restored on reload. Nothing leaves the device.
- **Backups that are yours.** Export the whole journal to JSON (round‑trips
  exactly) or Markdown (for reading elsewhere), and import to merge. Importing
  the same file twice is a no‑op; importing a phone's export onto a laptop
  unions the two. Until sync exists this is the only thing between a year of
  journalling and a cleared cache, so it lives in the notebook settings, not in
  a debug menu.
- **Works offline.** A service worker precaches the shell, and the three type
  families are self‑hosted — no request leaves the device to render a page.
- **Sync between your own devices.** Through a private gist in your own GitHub
  account: free, no new account, no server to run, no usage tier to outgrow.
  Set up one device with a GitHub token, then paste the sync code it gives you
  into the next one. The journal is encrypted on the device with AES‑GCM before
  it leaves, so GitHub only ever holds ciphertext.

## How sync resolves a clash

Two devices editing at once resolve per line, not per page. Every line carries
its own id and the time it last changed, so:

- a line only one device has is kept
- a line both edited resolves to whichever edit was later
- a deletion is a tombstone with a time, so it competes on equal terms — delete
  on the phone then edit on the PC and the edit wins

The consequence worth knowing: a merge can never silently drop writing. The
worst case is a line you deleted coming back because the other device touched
it more recently. Sync runs on open, a few seconds after you stop typing, when
you switch away, and on a slow poll — it is a journal, not a chat.

Lose the sync code and the copy on GitHub is unreadable; your local journal is
untouched. The code carries your GitHub token, so treat it like a password.

## Not built yet

The calendar rail, weekly/monthly spreads, collections, the margin assistant,
handwriting, and push notifications (which need a server the static site
doesn't have).

## Stack

Vite · React · TypeScript · Zustand (session state) · Dexie (IndexedDB) ·
@use-gesture (drag/swipe) · WebGL for the page‑turn · Vitest · ESLint ·
Prettier · vite-plugin-pwa. No component framework — the paper aesthetic is
hand‑built CSS and Canvas.

## Layout

```
src/
  lib/         date helpers, rapid-log grammar, Dexie schema, page store,
               rollover, natural-language dates, deadlines, backup/restore,
               sync (gist client, encryption, pairing, per-line merge),
               storage persistence, ids
  state/       zustand stores — session, overlays, quick-add
  components/  Desk · Book (turn logic) · Cover · DailyPage · RuledLines ·
               LineMenu · DayPicker · Sheet (dialog shell) · Search ·
               MonthJump · OpenLoops · Settings
  gl/          the WebGL page-turn engine
  render/      canvas painters for the turning leaf
  styles/      design tokens, self-hosted fonts, global reset
  assets/      woff2 subsets (regenerate with `npm run fonts`)
```

## Storage and your data

Marginalia keeps everything in this browser's IndexedDB. Browsers are allowed
to clear that — Safari evicts data for sites not visited in seven days unless
the app is installed to the home screen. On first write the app asks for
persistent storage, and the settings sheet tells you whether the browser
agreed. Take an export anyway.
