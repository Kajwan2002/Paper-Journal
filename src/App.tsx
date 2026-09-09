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

  useEffect(() => {
    let alive = true;
    ensureShelf().then((notebooks) => {
      if (!alive) return;
      setShelf(notebooks);
      const stillValid = notebooks.some((n) => n.id === notebookId);
      if (!stillValid) setNotebook(notebooks[0].id);
      void prime(notebooks[0].id, todayKey());
    });
    return () => {
      alive = false;
    };
    // notebookId intentionally read once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current =
    shelf?.find((n) => n.id === notebookId) ?? shelf?.[0] ?? null;

  return (
    <Desk>
      {current ? <Book key={current.id} notebook={current} /> : null}
    </Desk>
  );
}
