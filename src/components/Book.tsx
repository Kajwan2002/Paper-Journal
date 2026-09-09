import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDrag } from "@use-gesture/react";
import { useSession } from "@/state/session";
import { addDays } from "@/lib/date";
import { prime } from "@/lib/pageStore";
import { clamp01, runSpring } from "@/lib/spring";
import type { Notebook } from "@/lib/db";
import { DailyPage } from "@/components/DailyPage";
import { Cover } from "@/components/Cover";
import "./book.css";

type Dir = "next" | "prev";

const MAX_ANGLE = 168; // degrees the turning leaf sweeps through
const GRAB = 0.82; // fraction of page width that equals a full turn

function reducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function Book({ notebook }: { notebook: Notebook }) {
  const open = useSession((s) => s.open);
  const date = useSession((s) => s.date);
  const openBook = useSession((s) => s.openBook);
  const closeBook = useSession((s) => s.closeBook);
  const step = useSession((s) => s.step);

  const frameRef = useRef<HTMLDivElement>(null);
  const leafRef = useRef<HTMLDivElement | null>(null);
  const curlRef = useRef<HTMLDivElement | null>(null);
  const castRef = useRef<HTMLDivElement | null>(null);

  const [turn, setTurn] = useState<Dir | null>(null);
  const turnRef = useRef<Dir | null>(null);
  const progressRef = useRef(0);
  const busyRef = useRef(false);
  const gestureRef = useRef(false);
  const cancelSpringRef = useRef<(() => void) | null>(null);
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Write the leaf transform straight to the DOM — no React render per frame.
  const paint = useCallback((p: number) => {
    progressRef.current = p;
    const dir = turnRef.current;
    const leaf = leafRef.current;
    if (!dir || !leaf) return;
    const t = clamp01(p);
    const angle = dir === "prev" ? -MAX_ANGLE * (1 - p) : -MAX_ANGLE * p;
    const arc = Math.sin(t * Math.PI); // 0 → 1 → 0 across the turn
    // the page lifts off the spine and arcs over, rather than pivoting flat
    const lift = 6 + arc * 34;
    // a gentle bow — the leading edge leans as the sheet flexes
    const bow = dir === "prev" ? -arc * 5 : arc * 5;
    leaf.style.transform = `translateZ(${lift}px) rotateY(${angle}deg) rotateX(${bow}deg)`;
    if (curlRef.current) curlRef.current.style.opacity = String(arc * 0.8);
    if (castRef.current) castRef.current.style.opacity = String(arc * 0.45);
  }, []);

  const cleanup = useCallback(
    (commit: boolean) => {
      if (safetyRef.current) clearTimeout(safetyRef.current);
      safetyRef.current = null;
      const dir = turnRef.current;
      turnRef.current = null;
      gestureRef.current = false;
      cancelSpringRef.current = null;
      busyRef.current = false;
      setTurn(null);
      if (commit && dir) step(dir === "next" ? 1 : -1);
    },
    [step],
  );

  const settle = useCallback(
    (commit: boolean, velocity: number) => {
      cancelSpringRef.current?.();
      if (safetyRef.current) clearTimeout(safetyRef.current);
      if (reducedMotion()) {
        paint(commit ? 1 : 0);
        cleanup(commit);
        return;
      }
      // if rAF stalls (tab backgrounded mid-turn) finish anyway
      safetyRef.current = setTimeout(() => {
        cancelSpringRef.current?.();
        paint(commit ? 1 : 0);
        cleanup(commit);
      }, 1400);
      cancelSpringRef.current = runSpring(
        progressRef.current,
        commit ? 1 : 0,
        velocity,
        paint,
        () => cleanup(commit),
        { stiffness: 186, damping: 20 },
      );
    },
    [paint, cleanup],
  );

  const beginTurn = useCallback(
    (dir: Dir) => {
      if (busyRef.current) return false;
      busyRef.current = true;
      turnRef.current = dir;
      progressRef.current = 0;
      void prime(notebook.id, addDays(date, dir === "next" ? 1 : -1));
      setTurn(dir);
      return true;
    },
    [notebook.id, date],
  );

  // tap / keyboard: a full spring-driven turn
  const flip = useCallback(
    (dir: Dir) => {
      if (!open || !beginTurn(dir)) return;
      requestAnimationFrame(() => settle(true, 2.4));
    },
    [open, beginTurn, settle],
  );

  useLayoutEffect(() => {
    if (turn) paint(progressRef.current);
  }, [turn, paint]);

  useEffect(
    () => () => {
      cancelSpringRef.current?.();
      if (safetyRef.current) clearTimeout(safetyRef.current);
    },
    [],
  );

  const bindWell = useDrag(
    (state) => {
      if (!open) return;
      const {
        first,
        last,
        tap,
        movement: [mx],
        velocity: [vx],
        direction: [dx],
        event,
      } = state;
      const targetEl = event.target as HTMLElement | null;

      if (tap) {
        if (targetEl?.closest(".ruled__input, button")) return;
        const rect = frameRef.current?.getBoundingClientRect();
        const cx = (event as PointerEvent).clientX;
        if (!rect || cx == null) return;
        const x = cx - rect.left;
        if (x < rect.width * 0.3) flip("prev");
        else if (x > rect.width * 0.7) flip("next");
        return;
      }

      if (first) gestureRef.current = false;

      if (!gestureRef.current) {
        if (Math.abs(mx) < 6 || busyRef.current) return;
        if (!beginTurn(mx < 0 ? "next" : "prev")) return;
        gestureRef.current = true;
      }

      const dir = turnRef.current;
      if (!dir) return;
      const w = (frameRef.current?.clientWidth ?? 380) * GRAB;
      const travelled = dir === "next" ? -mx : mx;
      const p = clamp01(travelled / w);

      if (!last) {
        paint(p);
        return;
      }

      gestureRef.current = false;
      const turnVel = ((dir === "next" ? -1 : 1) * dx * vx * 1000) / w;
      const commit = turnVel > 0.9 ? true : turnVel < -0.9 ? false : p > 0.5;
      settle(commit, turnVel);
    },
    { axis: "x", filterTaps: true },
  );

  const bindCover = useDrag(
    ({ last, tap, movement: [mx], velocity: [vx] }) => {
      if (open || !last) return;
      if (tap || mx < -40 || (vx > 0.3 && mx < 0)) openBook();
    },
    { axis: "x", filterTaps: true },
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
        return;
      if (e.key === "ArrowRight" || e.key === "PageDown") flip("next");
      else if (e.key === "ArrowLeft" || e.key === "PageUp") flip("prev");
      else if (e.key === "Escape") closeBook();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flip, closeBook]);

  // `next` peels the current page away to reveal date+1; `prev` sweeps
  // date-1 in from the spine to cover the current page.
  const baseDate = turn === "next" ? addDays(date, 1) : date;
  const leafDate = turn === "prev" ? addDays(date, -1) : date;

  return (
    <div className={`book ${open ? "book--open" : ""}`} ref={frameRef}>
      <div className="book__spine" aria-hidden="true" />
      <div className="book__edges" aria-hidden="true" />

      <div className="book__well" {...bindWell()}>
        <div className="book__leaf book__leaf--base">
          <DailyPage
            notebookId={notebook.id}
            date={baseDate}
            interactive={!turn}
          />
        </div>

        {turn ? (
          <div
            ref={(el) => {
              castRef.current = el;
            }}
            className="book__cast"
            style={{ opacity: 0 }}
            aria-hidden="true"
          />
        ) : null}

        {turn ? (
          <div
            ref={(el) => {
              leafRef.current = el;
            }}
            className="book__leaf book__leaf--turning"
            style={{
              transform: `rotateY(${turn === "prev" ? -MAX_ANGLE : 0}deg)`,
            }}
          >
            <div className="book__face book__face--front">
              <DailyPage
                notebookId={notebook.id}
                date={leafDate}
                interactive={false}
              />
            </div>
            <div className="book__face book__face--back" aria-hidden="true" />
            <div
              ref={(el) => {
                curlRef.current = el;
              }}
              className="book__curl"
              style={{ opacity: 0 }}
              aria-hidden="true"
            />
          </div>
        ) : null}

        {open ? (
          <div className="book__nav" aria-hidden={false}>
            <button
              type="button"
              className="sr-only"
              onClick={() => flip("prev")}
            >
              Previous day
            </button>
            <button
              type="button"
              className="sr-only"
              onClick={() => flip("next")}
            >
              Next day
            </button>
          </div>
        ) : null}
      </div>

      <Cover title={notebook.title} cover={notebook.cover} open={open} />

      {!open ? (
        <div
          className="book__coverdrag"
          {...bindCover()}
          role="button"
          tabIndex={0}
          aria-label={`Open ${notebook.title}`}
          onClick={openBook}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openBook();
            }
          }}
        />
      ) : null}

      {open ? (
        <button
          type="button"
          className="book__close"
          aria-label="Close notebook"
          onClick={closeBook}
        >
          <span className="book__ribbon" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
