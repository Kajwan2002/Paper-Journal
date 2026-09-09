import { useEffect, useState } from "react";
import { ensureShelf, type Notebook } from "@/lib/db";
import { prime } from "@/lib/pageStore";
import { rolloverToToday } from "@/lib/rollover";
import { todayKey } from "@/lib/date";
import { useSession } from "@/state/session";
import { useOverlay } from "@/state/overlay";
import { Desk } from "@/components/Desk";
import { Book } from "@/components/Book";

export function App() {
  const [shelf, setShelf] = useState<Notebook[] | null>(null);
  const notebookId = useSession((s) => s.notebookId);
  const setNotebook = useSession((s) => s.setNotebook);
  const date = useSession((s) => s.date);
  const goToday = useSession((s) => s.goToday);

  useEffect(() => {
    let alive = true;
    (async () => {
      const notebooks = await ensureShelf();
      if (!alive) return;
      setShelf(notebooks);
      const stillValid = notebooks.some((n) => n.id === notebookId);
      const id = stillValid ? notebookId! : notebooks[0].id;
      if (!stillValid) setNotebook(id);
      await prime(id, todayKey());
      void prime(id, date);
      if (!alive) return;
      await rolloverToToday(id);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // if the app was left open overnight, land on the new "today" and carry
  // any unfinished tasks forward
  useEffect(() => {
    const onShow = async () => {
      if (document.hidden) return;
      const id = useSession.getState().notebookId;
      if (id && useSession.getState().date < todayKey()) {
        goToday();
        await prime(id, todayKey());
        await rolloverToToday(id);
      }
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [goToday]);

  // a global shortcut to search — Cmd/Ctrl+F, or a bare "/" when nothing typed
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      if ((e.key === "f" || e.key === "F") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        useOverlay.getState().openSearch();
      } else if (e.key === "/" && !typing && !useOverlay.getState().search) {
        e.preventDefault();
        useOverlay.getState().openSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const current = shelf?.find((n) => n.id === notebookId) ?? shelf?.[0] ?? null;

  return (
    <Desk>{current ? <Book key={current.id} notebook={current} /> : null}</Desk>
  );
}
