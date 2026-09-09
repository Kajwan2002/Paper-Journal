import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useDrag } from "@use-gesture/react";
import type { Notebook } from "@/lib/db";
import { addDays, type DayKey } from "@/lib/date";
import { useSession } from "@/state/session";
import { getCached, prime } from "@/lib/pageStore";
import { clamp01, runSpring } from "@/lib/spring";
import { PageTurnGL } from "@/gl/engine";
import { paintPage } from "@/render/paintPage";
import { paintCover } from "@/render/paintCover";
import { hexToRgb, readPalette } from "@/lib/theme";
import { prefersReducedMotion } from "@/lib/prefs";
import { useOverlay } from "@/state/overlay";
import { DailyPage } from "@/components/DailyPage";
import { MonthJump } from "@/components/MonthJump";
import { Search } from "@/components/Search";
import "./book.css";

const ASPECT = 0.7; // one page: width / height
const CANVAS_PAD_X = 1.09; // canvas width  = spread * this
const CANVAS_PAD_Y = 1.34; // canvas height = pageH * this
const FLING = 1.2; // t/sec that forces a commit or a cancel

type Kind = "page" | "cover";
interface Turn {
  kind: Kind;
  dir: 1 | -1; // 1 = forward (right leaf folds left) · -1 = back (left leaf lifts right)
  leftDate: DayKey; // what the left half shows during the turn
  rightDate: DayKey; // what the right half shows during the turn
}
const NARROW_MAX = 680; // below this the spread won't fit — zoom to the active page

interface Geom {
  pageW: number;
  pageH: number;
  spreadW: number;
  /** screen x of the spine when the book is open */
  spineX: number;
  /** screen x of the spine when the book is closed (cover always centred) */
  centerX: number;
  topY: number;
  canvasW: number;
  canvasH: number;
  dpr: number;
  narrow: boolean;
}

function measure(el: HTMLElement | null): Geom {
  const m = 18;
  const stageW = el?.clientWidth ?? window.innerWidth;
  const stageH = el?.clientHeight ?? window.innerHeight;
  const availW = stageW - m * 2;
  const availH = stageH - m * 2;
  const narrow = availW < NARROW_MAX;

  // narrow: size a whole page to the width and let the left page fall off
  // the screen; wide: fit the whole two-page spread.
  const pageH = Math.max(
    220,
    narrow
      ? Math.min(availH * 0.9, (availW * 0.96) / ASPECT)
      : Math.min(availH * 0.82, ((availW / 2) * 0.98) / ASPECT),
  );
  const pageW = pageH * ASPECT;
  const spreadW = pageW * 2;
  const centerX = stageW / 2;

  return {
    pageW,
    pageH,
    spreadW,
    // on a phone push the spine near the left edge so the active (right)
    // page fills the screen with just a sliver of yesterday at the gutter
    spineX: narrow ? m + availW * 0.08 : centerX,
    centerX,
    topY: Math.max(m, (stageH - pageH) / 2),
    canvasW: spreadW * CANVAS_PAD_X,
    canvasH: pageH * CANVAS_PAD_Y,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    narrow,
  };
}

const engineCache = new WeakMap<HTMLCanvasElement, PageTurnGL>();

export function Book({ notebook }: { notebook: Notebook }) {
  const open = useSession((s) => s.open);
  const date = useSession((s) => s.date);
  const openBook = useSession((s) => s.openBook);
  const closeBook = useSession((s) => s.closeBook);
  const step = useSession((s) => s.step);

  const monthOpen = useOverlay((s) => s.month);
  const searchOpen = useOverlay((s) => s.search);
  const closeOverlay = useOverlay((s) => s.close);

  const wrapRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PageTurnGL | null>(null);
  const leafC = useRef<HTMLCanvasElement>(document.createElement("canvas"));

  const [geom, setGeom] = useState<Geom>(() => measure(null));
  const geomRef = useRef(geom);
  geomRef.current = geom;

  const [turn, setTurn] = useState<Turn | null>(null);
  const [settling, setSettling] = useState(false);
  const turnRef = useRef<Turn | null>(null);
  const tRef = useRef(0);
  const busyRef = useRef(false);
  const cancelSpring = useRef<(() => void) | null>(null);
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- sizing ---------------------------------------------------------
  useEffect(() => {
    const stage = wrapRef.current?.parentElement ?? null;
    const apply = () => {
      const g = measure(stage);
      setGeom(g);
      engineRef.current?.resize(g.canvasW, g.canvasH, g.pageW, g.pageH, g.dpr);
    };
    apply();
    const ro = new ResizeObserver(apply);
    if (stage) ro.observe(stage);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, []);

  // --- engine (one context per <canvas>, kept across StrictMode) -------
  useEffect(() => {
    const canvas = glRef.current;
    if (!canvas) return;
    let engine = engineCache.get(canvas) ?? null;
    if (!engine) {
      try {
        engine = new PageTurnGL(canvas);
        engineCache.set(canvas, engine);
      } catch (err) {
        console.warn("page-turn: WebGL unavailable — instant turns", err);
        return;
      }
    }
    engineRef.current = engine;
    const g = geomRef.current;
    engine.resize(g.canvasW, g.canvasH, g.pageW, g.pageH, g.dpr);

    const onLost = (e: Event) => {
      e.preventDefault();
      engineCache.delete(canvas);
      engineRef.current = null;
    };
    const onRestored = () => {
      try {
        const fresh = new PageTurnGL(canvas);
        engineCache.set(canvas, fresh);
        const g2 = geomRef.current;
        fresh.resize(g2.canvasW, g2.canvasH, g2.pageW, g2.pageH, g2.dpr);
        engineRef.current = fresh;
      } catch {
        /* stay in fallback */
      }
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    };
  }, []);

  const linesFor = useCallback(
    (d: DayKey) => getCached(`${notebook.id}__${d}`) ?? [],
    [notebook.id],
  );

  const dressLeaf = useCallback(
    (kind: Kind, frontDate: DayKey) => {
      const g = geomRef.current;
      const c = leafC.current;
      const pal = readPalette();
      const [pr, pg, pb] = hexToRgb(pal.paper);
      engineRef.current?.setPaper(pr / 255, pg / 255, pb / 255);
      if (kind === "cover") {
        paintCover(
          c,
          g.pageW,
          g.pageH,
          g.dpr,
          notebook.title,
          notebook.cover,
        );
      } else {
        paintPage({
          canvas: c,
          pageW: g.pageW,
          pageH: g.pageH,
          dpr: g.dpr,
          date: frontDate,
          lines: linesFor(frontDate),
          paper: notebook.paper,
          palette: pal,
        });
      }
      engineRef.current?.setLeaf(c);
    },
    [notebook.title, notebook.cover, notebook.paper, linesFor],
  );

  const paint = useCallback((t: number) => {
    tRef.current = t;
    const tn = turnRef.current;
    if (tn) engineRef.current?.render(t, tn.dir);
  }, []);

  const finalize = useCallback(
    (committed: boolean) => {
      if (safety.current) clearTimeout(safety.current);
      safety.current = null;
      cancelSpring.current = null;
      const t = turnRef.current;
      turnRef.current = null;
      busyRef.current = false;
      setTurn(null);
      setSettling(true);
      const eng = engineRef.current;
      setTimeout(() => {
        setSettling(false);
        if (!turnRef.current) eng?.clear();
      }, 240);
      if (!committed || !t) return;
      if (t.kind === "cover") {
        if (t.dir === 1) openBook();
        else closeBook();
      } else {
        step(t.dir === 1 ? 1 : -1);
      }
    },
    [openBook, closeBook, step],
  );

  const settle = useCallback(
    (target: 0 | 1, velocity: number) => {
      cancelSpring.current?.();
      if (safety.current) clearTimeout(safety.current);
      const committed = target === 1;
      if (prefersReducedMotion() || !engineRef.current || !turnRef.current) {
        paint(target);
        finalize(committed);
        return;
      }
      safety.current = setTimeout(() => {
        cancelSpring.current?.();
        paint(target);
        finalize(committed);
      }, 1600);
      cancelSpring.current = runSpring(
        tRef.current,
        target,
        velocity,
        paint,
        () => finalize(committed),
        { stiffness: 188, damping: 22 },
      );
    },
    [paint, finalize],
  );

  const begin = useCallback(
    (kind: Kind, dir: 1 | -1): boolean => {
      if (busyRef.current) return false;
      const engine = engineRef.current;

      if (prefersReducedMotion() || !engine) {
        if (kind === "cover") {
          if (dir === 1) openBook();
          else closeBook();
        } else {
          step(dir === 1 ? 1 : -1);
        }
        return false;
      }

      const from = date;
      const frontDate =
        kind === "cover" ? from : dir === 1 ? from : addDays(from, -1);
      // what the two halves show behind the leaf during the turn
      const leftDate =
        kind === "cover"
          ? addDays(from, -1)
          : dir === 1
            ? addDays(from, -1)
            : addDays(from, -2);
      const rightDate =
        kind === "cover" ? from : dir === 1 ? addDays(from, 1) : from;

      if (kind === "page") {
        void prime(notebook.id, dir === 1 ? rightDate : leftDate);
      }

      busyRef.current = true;
      const t: Turn = { kind, dir, leftDate, rightDate };
      turnRef.current = t;
      tRef.current = 0;
      dressLeaf(kind, frontDate);
      paint(0);
      setTurn(t);
      return true;
    },
    [date, notebook.id, dressLeaf, paint, openBook, closeBook, step],
  );

  const flip = useCallback(
    (kind: Kind, dir: 1 | -1) => {
      if (!begin(kind, dir)) return;
      settle(1, kind === "cover" ? 2.6 : 3.2);
    },
    [begin, settle],
  );

  // --- gesture -------------------------------------------------------
  const grabRef = useRef<null | { kind: Kind; dir: 1 | -1; span: number }>(
    null,
  );

  const bind = useDrag(
    (state) => {
      const {
        first,
        last,
        tap,
        xy: [px],
        initial: [ix],
        movement: [mx],
        velocity: [vx],
        direction: [dxs],
        event,
      } = state;
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      // fraction across the active page: 0 at the spine, 1 at its outer
      // edge, negative over the facing page. Works in both layouts.
      const spineScreenX = rect.left + rect.width / 2;
      const pageFrac = (x: number) => (x - spineScreenX) / geomRef.current.pageW;

      if (tap) {
        const el = event.target as HTMLElement | null;
        if (el?.closest(".ruled__input, button, a")) return;
        if (!open) return flip("cover", 1);
        const f = pageFrac(px);
        if (f > 0.52) flip("page", 1);
        else if (f < 0.12) flip("page", -1);
        return;
      }

      if (first) {
        grabRef.current = null;
        if (busyRef.current) return;
        const span = geomRef.current.pageW * 0.82;
        if (!open) {
          grabRef.current = { kind: "cover", dir: 1, span };
        } else {
          const dir = pageFrac(ix) >= 0.22 ? 1 : -1;
          grabRef.current = { kind: "page", dir, span };
        }
        return;
      }

      const grab = grabRef.current;
      if (!grab) return;

      if (!turnRef.current) {
        const want = grab.dir === 1 ? -8 : 8; // fwd pulls left, back pulls right
        if (grab.dir === 1 ? mx > want : mx < want) {
          if (Math.abs(mx) > 8) grabRef.current = null;
          return;
        }
        if (!begin(grab.kind, grab.dir)) {
          grabRef.current = null;
          return;
        }
      }

      const t = turnRef.current;
      if (!t) return;
      const toward = t.dir === 1 ? -mx : mx; // px in the turning direction
      const prog = clamp01(toward / grab.span);

      if (!last) {
        paint(prog);
        return;
      }

      const vSigned = (dxs || 0) * vx * 1000; // px/sec
      const vTurn = (t.dir === 1 ? -vSigned : vSigned) / grab.span; // t/sec
      let commit = prog > 0.5;
      if (vTurn > FLING) commit = true;
      else if (vTurn < -FLING) commit = false;
      settle(commit ? 1 : 0, vTurn);
      grabRef.current = null;
    },
    { filterTaps: true, pointer: { touch: true }, axis: "x" },
  );

  // --- keyboard ----------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ov = useOverlay.getState();
      if (ov.month || ov.search) return; // the overlay owns the keyboard
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
        return;
      if (!open) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          flip("cover", 1);
        }
        return;
      }
      if (e.key === "ArrowRight" || e.key === "PageDown") flip("page", 1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") flip("page", -1);
      else if (e.key === "Escape") flip("cover", -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flip]);

  useEffect(
    () => () => {
      cancelSpring.current?.();
      if (safety.current) clearTimeout(safety.current);
    },
    [],
  );

  // dev-only leaf driver for visual tuning
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as Record<string, unknown>;
    w.__leaf = (t: number, dir: 1 | -1 = 1, kind: Kind = "page") => {
      const frontDate = dir === 1 ? date : addDays(date, -1);
      const tn: Turn = {
        kind,
        dir,
        leftDate: addDays(date, dir === 1 ? -1 : -2),
        rightDate: dir === 1 ? addDays(date, 1) : date,
      };
      turnRef.current = tn;
      setTurn(tn);
      dressLeaf(kind, kind === "cover" ? date : frontDate);
      requestAnimationFrame(() => engineRef.current?.render(t, dir));
    };
    return () => {
      delete w.__leaf;
    };
  }, [dressLeaf, date]);

  const g = geom;
  const closed = !open && !turn;
  const closing = turn?.kind === "cover" && turn.dir === -1;
  const spineFrac = g.pageW / g.spreadW;

  const leftDate = turn ? turn.leftDate : addDays(date, -1);
  const rightDate = turn ? turn.rightDate : date;
  const rightLive = !turn && open;

  return (
    <div
      ref={wrapRef}
      className={`book ${open ? "book--open" : ""} ${
        turn ? "book--turning" : ""
      } ${closing ? "book--closing" : ""} ${
        settling ? "book--settling" : ""
      } ${closed ? "book--closed" : ""}`}
      style={
        {
          position: "absolute",
          left: `${
            open || turn ? g.spineX - g.pageW : g.centerX - g.pageW * 1.5
          }px`,
          top: `${g.topY}px`,
          width: `${g.spreadW}px`,
          height: `${g.pageH}px`,
          "--spine-frac": spineFrac,
        } as CSSProperties
      }
      {...bind()}
    >
      <div className="book__board" aria-hidden="true" />
      <div className="book__stack book__stack--l" aria-hidden="true" />
      <div className="book__stack book__stack--r" aria-hidden="true" />

      {closed ? (
        <div
          className={`book__cover book__cover--${notebook.cover}`}
          aria-hidden="true"
        >
          <span className="book__cover-grain" />
          <span className="book__cover-frame" />
          <span className="book__cover-title">{notebook.title}</span>
        </div>
      ) : (
        <>
          <div className="book__half book__half--left" aria-hidden="true">
            <DailyPage
              notebookId={notebook.id}
              date={leftDate}
              interactive={false}
            />
          </div>
          <div className="book__gutter" aria-hidden="true" />
          <div className="book__half book__half--right">
            <DailyPage
              notebookId={notebook.id}
              date={rightDate}
              interactive={rightLive}
            />
          </div>
        </>
      )}

      <canvas
        ref={glRef}
        className="book__gl"
        aria-hidden="true"
        style={{
          width: `${g.canvasW}px`,
          height: `${g.canvasH}px`,
          left: `${(g.spreadW - g.canvasW) / 2}px`,
          top: `${-(g.canvasH - g.pageH) / 2}px`,
        }}
      />

      {open && !turn ? (
        <button
          type="button"
          className="book__ribbon"
          aria-label="Close notebook"
          onClick={() => flip("cover", -1)}
        />
      ) : null}

      <button
        type="button"
        className="sr-only"
        onClick={() => flip(open ? "page" : "cover", open ? -1 : 1)}
      >
        {open ? "Previous day" : "Open notebook"}
      </button>
      {open ? (
        <button
          type="button"
          className="sr-only"
          onClick={() => flip("page", 1)}
        >
          Next day
        </button>
      ) : null}

      {monthOpen ? (
        <MonthJump
          notebookId={notebook.id}
          anchorDate={date}
          onClose={closeOverlay}
        />
      ) : null}
      {searchOpen ? (
        <Search notebookId={notebook.id} onClose={closeOverlay} />
      ) : null}
    </div>
  );
}
