import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { db, type Page } from "@/lib/db";
import { prime } from "@/lib/pageStore";
import { isToday, longDate, type DayKey } from "@/lib/date";
import { GLYPH, type Line } from "@/lib/rapidlog";
import { useSession } from "@/state/session";
import "./search.css";

interface Hit {
  date: DayKey;
  line: Line;
}

interface Props {
  notebookId: string;
  onClose: () => void;
}

export function Search({ notebookId, onClose }: Props) {
  const [pages, setPages] = useState<Page[] | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const fieldRef = useRef<HTMLInputElement>(null);
  const goToDate = useSession((s) => s.goToDate);
  const query = useDeferredValue(q.trim().toLowerCase());

  useEffect(() => {
    db.pages
      .where("notebookId")
      .equals(notebookId)
      .toArray()
      .then(setPages);
  }, [notebookId]);

  useEffect(() => {
    fieldRef.current?.focus();
  }, []);

  const hits = useMemo<Hit[]>(() => {
    if (!pages || query.length < 2) return [];
    const out: Hit[] = [];
    for (const p of pages) {
      for (const line of p.lines) {
        if (line.text.toLowerCase().includes(query)) {
          out.push({ date: p.date, line });
        }
      }
    }
    out.sort((a, b) => (a.date < b.date ? 1 : -1));
    return out.slice(0, 40);
  }, [pages, query]);

  useEffect(() => setSel(0), [query]);

  const jump = (date: DayKey) => {
    goToDate(date);
    void prime(notebookId, date);
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && hits[sel]) {
      e.preventDefault();
      jump(hits[sel].date);
    }
  };

  return (
    <div
      className="search__scrim"
      onPointerDownCapture={(e) => e.stopPropagation()}
      onClick={onClose}
    >
      <div className="search" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="search__bar">
          <span className="search__glyph" aria-hidden="true">
            ⌕
          </span>
          <input
            ref={fieldRef}
            className="search__field"
            placeholder="Find a line…"
            value={q}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {query.length >= 2 ? (
          hits.length ? (
            <ul className="search__peeks">
              {hits.map((h, i) => (
                <li key={`${h.date}-${h.line.id}`}>
                  <button
                    type="button"
                    className={`search__peek ${
                      i === sel ? "search__peek--sel" : ""
                    }`}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => jump(h.date)}
                  >
                    <span className="search__when">
                      {isToday(h.date) ? "today" : longDate(h.date)}
                    </span>
                    <span className="search__line">
                      <span className="search__linemark">
                        {GLYPH[h.line.kind]}
                      </span>
                      {highlight(h.line.text, query)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="search__empty">Nothing on any page.</p>
          )
        ) : null}
      </div>
    </div>
  );
}

function highlight(text: string, q: string) {
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}
