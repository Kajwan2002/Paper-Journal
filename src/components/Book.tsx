import { useCallback, useEffect, useRef, useState } from "react";
import { useDrag } from "@use-gesture/react";
import { useSession } from "@/state/session";
import { addDays } from "@/lib/date";
import { prime } from "@/lib/pageStore";
import type { Notebook } from "@/lib/db";
import { DailyPage } from "@/components/DailyPage";
import { Cover } from "@/components/Cover";
import "./book.css";

type Dir = "next" | "prev";

export function Book({ notebook }: { notebook: Notebook }) {
  const open = useSession((s) => s.open);
  const date = useSession((s) => s.date);
  const openBook = useSession((s) => s.openBook);
  const closeBook = useSession((s) => s.closeBook);
  const step = useSession((s) => s.step);

  const frameRef = useRef<HTMLDivElement>(null);
  const [turn, setTurn] = useState<Dir | null>(null);
  const turnRef = useRef<Dir | null>(null);
  const busy = useRef(false);

  const endTurn = useCallback(() => {
    const dir = turnRef.current;
    if (!dir) return;
    turnRef.current = null;
    busy.current = false;
    setTurn(null);
    step(dir === "next" ? 1 : -1);
  }, [step]);

  const startTurn = useCallback(
    (dir: Dir) => {
      if (busy.current || !open) return;
      busy.current = true;
      turnRef.current = dir;
      void prime(notebook.id, addDays(date, dir === "next" ? 1 : -1));
      setTurn(dir);
      // safety net in case animationend is missed (e.g. tab backgrounded)
      window.setTimeout(() => {
        if (busy.current) endTurn();
      }, 1000);
    },
    [open, notebook.id, date, endTurn],
  );

  const bindEdge = useDrag(
    ({ args, last, tap, movement: [mx], velocity: [vx] }) => {
      if (!open || !last) return;
      const dir = args[0] as Dir;
      if (tap) {
        startTurn(dir);
        return;
      }
      const width = frameRef.current?.clientWidth ?? 380;
      if (Math.abs(mx) / width > 0.16 || vx > 0.35) startTurn(dir);
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
      if (e.key === "ArrowRight" || e.key === "PageDown") startTurn("next");
      else if (e.key === "ArrowLeft" || e.key === "PageUp") startTurn("prev");
      else if (e.key === "Escape") closeBook();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, startTurn, closeBook]);

  // `next` peels the current page away to reveal date+1 behind it;
  // `prev` sweeps date-1 in from the spine to cover the current page.
  const baseDate = turn === "next" ? addDays(date, 1) : date;
  const leafDate = turn === "prev" ? addDays(date, -1) : date;

  return (
    <div className={`book ${open ? "book--open" : ""}`} ref={frameRef}>
      <div className="book__spine" aria-hidden="true" />
      <div className="book__edges" aria-hidden="true" />

      <div className="book__well">
        <div className="book__leaf book__leaf--base">
          <DailyPage
            notebookId={notebook.id}
            date={baseDate}
            interactive={!turn}
          />
        </div>

        {turn ? (
          <div
            className="book__leaf book__leaf--turning"
            data-dir={turn}
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget) endTurn();
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
            <div className="book__curl" aria-hidden="true" />
          </div>
        ) : null}

        {open ? (
          <>
            <div
              className="book__edge book__edge--prev"
              {...bindEdge("prev")}
              onClick={() => startTurn("prev")}
              role="button"
              aria-label="Previous day"
              tabIndex={-1}
            />
            <div
              className="book__edge book__edge--next"
              {...bindEdge("next")}
              onClick={() => startTurn("next")}
              role="button"
              aria-label="Next day"
              tabIndex={-1}
            />
          </>
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
