import { useEffect, useState } from "react";
import { ensureShelf, type Notebook } from "@/lib/db";
import { prime } from "@/lib/pageStore";
import { todayKey } from "@/lib/date";
import { useSession } from "@/state/session";
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
    ensureShelf().then((notebooks) => {
      if (!alive) return;
      setShelf(notebooks);
      const stillValid = notebooks.some((n) => n.id === notebookId);
      const id = stillValid ? notebookId! : notebooks[0].id;
      if (!stillValid) setNotebook(id);
      void prime(id, todayKey());
      void prime(id, date);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // if the app was left open overnight, land on the new "today"
  useEffect(() => {
    const onShow = () => {
      if (!document.hidden && useSession.getState().date < todayKey()) {
        goToday();
      }
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [goToday]);

  const current = shelf?.find((n) => n.id === notebookId) ?? shelf?.[0] ?? null;

  return (
    <Desk>{current ? <Book key={current.id} notebook={current} /> : null}</Desk>
  );
}
