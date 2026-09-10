import { useCallback, useEffect, useState } from "react";
import { ensureShelf, type Notebook } from "@/lib/db";
import { prime, subscribeJournal } from "@/lib/pageStore";
import { openLoops, rolloverToToday } from "@/lib/rollover";
import { settleLegacySchedules } from "@/lib/schedule";
import { comingDue } from "@/lib/deadline";
import { requestPersistence } from "@/lib/persist";
import { todayKey } from "@/lib/date";
import { useSession } from "@/state/session";
import { useOverlay } from "@/state/overlay";
import { Desk } from "@/components/Desk";
import { Book } from "@/components/Book";
import { MonthJump } from "@/components/MonthJump";
import { Search } from "@/components/Search";
import { OpenLoops } from "@/components/OpenLoops";
import { Settings } from "@/components/Settings";
import "./app.css";

type Boot =
  | { state: "loading" }
  | { state: "ready"; shelf: Notebook[] }
  | { state: "failed"; error: string };

export function App() {
  const [boot, setBoot] = useState<Boot>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [loops, setLoops] = useState(0);
  const notebookId = useSession((s) => s.notebookId);
  const setNotebook = useSession((s) => s.setNotebook);
  const date = useSession((s) => s.date);
  const goToday = useSession((s) => s.goToday);
  const overlay = useOverlay((s) => s.open);
  const closeOverlay = useOverlay((s) => s.close);

  const [overdue, setOverdue] = useState(0);

  const countLoops = useCallback((id: string) => {
    void openLoops(id).then((all) =>
      setLoops(all.filter((l) => !l.line.someday).length),
    );
    void comingDue(id).then((all) =>
      setOverdue(
        all.filter((d) => d.urgency === "late" || d.urgency === "today").length,
      ),
    );
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const notebooks = await ensureShelf();
        if (!alive) return;
        setBoot({ state: "ready", shelf: notebooks });
        const stillValid = notebooks.some((n) => n.id === notebookId);
        const id = stillValid ? notebookId! : notebooks[0].id;
        if (!stillValid) setNotebook(id);

        // A planner opens on today. The session remembers the page you were
        // last on, which is right within a day — but reopening the app the
        // next morning used to leave you on yesterday, so a task that had
        // just been carried forward was on a page you weren't looking at.
        // A date in the future is a deliberate flip forward; leave it be.
        const landOn = date < todayKey() ? todayKey() : date;
        if (landOn !== date) goToday();
        await prime(id, todayKey());
        void prime(id, landOn);
        if (!alive) return;
        await rolloverToToday(id);
        if (!alive) return;
        // journals written before scheduling moved anything still have
        // tasks stamped with a date but sitting on the day they were
        // written — walk them onto their day so the week ahead reads right
        await settleLegacySchedules(id);
        if (!alive) return;
        countLoops(id);
        void requestPersistence();
      } catch (err) {
        if (!alive) return;
        setBoot({
          state: "failed",
          error:
            err instanceof Error
              ? err.message
              : "The notebook couldn't be opened.",
        });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // Land on the new "today" and carry unfinished tasks forward — whether the
  // app was hidden overnight or simply left open on a desk. The timer is the
  // half that used to be missing: a tab that stayed visible past midnight sat
  // on yesterday until something else woke it.
  useEffect(() => {
    const catchUp = async () => {
      const id = useSession.getState().notebookId;
      if (!id) return;
      if (useSession.getState().date >= todayKey()) return;
      goToday();
      await prime(id, todayKey());
      await rolloverToToday(id);
      countLoops(id);
    };

    const onShow = () => {
      if (!document.hidden) void catchUp();
    };
    document.addEventListener("visibilitychange", onShow);

    let timer: ReturnType<typeof setTimeout>;
    const armMidnight = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(24, 0, 5, 0); // just past midnight, local
      timer = setTimeout(() => {
        void catchUp();
        armMidnight();
      }, next.getTime() - now.getTime());
    };
    armMidnight();

    return () => {
      document.removeEventListener("visibilitychange", onShow);
      clearTimeout(timer);
    };
  }, [goToday, countLoops]);

  // a global shortcut to search — Cmd/Ctrl+F, or a bare "/" when nothing typed
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      const store = useOverlay.getState();
      if ((e.key === "f" || e.key === "F") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        store.show("search");
      } else if (e.key === "/" && !typing && store.open === null) {
        e.preventDefault();
        store.show("search");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shelf = boot.state === "ready" ? boot.shelf : null;
  const current = shelf?.find((n) => n.id === notebookId) ?? shelf?.[0] ?? null;

  // keep the ribbon's count honest: on any write to any page, and whenever
  // an overlay closes. Debounced, since typing writes on every keystroke.
  useEffect(() => {
    if (!current) return;
    countLoops(current.id);
    let timer: ReturnType<typeof setTimeout>;
    const stop = subscribeJournal(() => {
      clearTimeout(timer);
      timer = setTimeout(() => countLoops(current.id), 600);
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [overlay, current, countLoops]);

  const refreshShelf = useCallback(() => setAttempt((n) => n + 1), []);
  const retry = useCallback(() => {
    setBoot({ state: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  if (boot.state === "failed") {
    return <Blocked error={boot.error} onRetry={retry} />;
  }

  return (
    <>
      <Desk loops={loops} overdue={overdue}>
        {current ? <Book key={current.id} notebook={current} /> : null}
      </Desk>
      {current && overlay === "month" ? (
        <MonthJump
          notebookId={current.id}
          anchorDate={date}
          onClose={closeOverlay}
        />
      ) : null}
      {current && overlay === "search" ? (
        <Search notebookId={current.id} onClose={closeOverlay} />
      ) : null}
      {current && overlay === "loops" ? (
        <OpenLoops notebookId={current.id} onClose={closeOverlay} />
      ) : null}
      {current && overlay === "settings" ? (
        <Settings
          notebook={current}
          onChanged={refreshShelf}
          onOpenNotebook={(id) => {
            setNotebook(id);
            refreshShelf();
          }}
          onClose={closeOverlay}
        />
      ) : null}
    </>
  );
}

/** IndexedDB can be unavailable outright — private-mode Firefox, a locked
 *  down WebView, storage pressure. Say so, instead of showing a bare desk
 *  and an unhandled rejection in the console. */
function Blocked({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="blocked">
      <div className="blocked__card">
        <h1 className="blocked__title">The notebook won't open</h1>
        <p className="blocked__body">
          Marginalia keeps everything in this browser's own storage, and this
          browser wouldn't hand it over. Private browsing and blocked site data
          are the usual reasons.
        </p>
        <p className="blocked__detail">{error}</p>
        <button type="button" className="sheet__btn" onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  );
}
