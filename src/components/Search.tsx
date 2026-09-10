import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { db, type Page } from "@/lib/db";
import { flushAsync, prime } from "@/lib/pageStore";
import { relativeDay, todayKey, type DayKey } from "@/lib/date";
import {
  GLYPH,
  glyphFor,
  isOpenTask,
  isStruck,
  isTaskKind,
  type Line,
} from "@/lib/rapidlog";
import { useSession } from "@/state/session";
import { Sheet } from "@/components/Sheet";
import "./search.css";

const LIMIT = 60;

type Filter = "all" | "open" | "done" | "event" | "idea";

const FILTERS: Array<[Filter, string, string]> = [
  ["all", "all", "⌕"],
  ["open", "open", GLYPH.task],
  ["done", "done", "×"],
  ["event", "events", GLYPH.event],
  ["idea", "ideas", GLYPH.idea],
];

function matches(line: Line, filter: Filter): boolean {
  switch (filter) {
    case "open":
      return isOpenTask(line);
    case "done":
      return isStruck(line);
    case "event":
      return line.kind === "event";
    case "idea":
      return line.kind === "idea";
    default:
      return true;
  }
}

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
  const [filter, setFilter] = useState<Filter>("all");
  const [sel, setSel] = useState(0);
  const fieldRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const goToDate = useSession((s) => s.goToDate);
  const query = useDeferredValue(q.trim().toLowerCase());

  useEffect(() => {
    let alive = true;
    void (async () => {
      // Land the debounced writes first — otherwise the line you typed two
      // seconds ago is not in the database yet and search swears it doesn't
      // exist.
      await flushAsync();
      const rows = await db.pages
        .where("notebookId")
        .equals(notebookId)
        .toArray();
      if (alive) setPages(rows);
    })();
    return () => {
      alive = false;
    };
  }, [notebookId]);

  useEffect(() => {
    fieldRef.current?.focus();
  }, []);

  const all = useMemo<Hit[]>(() => {
    if (!pages) return [];
    const bare = query.length < 2;
    if (bare && filter === "all") return [];
    const out: Hit[] = [];
    for (const p of pages) {
      for (const line of p.lines) {
        if (!line.text.trim()) continue;
        if (!matches(line, filter)) continue;
        if (!bare && !line.text.toLowerCase().includes(query)) continue;
        out.push({ date: p.date, line });
      }
    }
    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return out;
  }, [pages, query, filter]);

  const hits = all.slice(0, LIMIT);
  const searching = query.length >= 2 || filter !== "all";

  // React's own "adjust state during render" pattern — a new query means a
  // new list, so the highlight belongs back at the top before we paint.
  const resultKey = `${query}\u0000${filter}`;
  const [lastKey, setLastKey] = useState(resultKey);
  if (lastKey !== resultKey) {
    setLastKey(resultKey);
    setSel(0);
  }

  useEffect(() => {
    const items = listRef.current?.querySelectorAll("li");
    items?.[sel]?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const jump = (date: DayKey) => {
    goToDate(date);
    void prime(notebookId, date);
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
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

  const today = todayKey();

  return (
    <Sheet label="Search the notebook" onClose={onClose}>
      <div className="search" onKeyDown={onKey}>
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
            aria-label="Find a line"
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            type="button"
            className="search__close"
            aria-label="Close search"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="search__filters" role="group" aria-label="Only show">
          {FILTERS.map(([id, label, glyph]) => (
            <button
              key={id}
              type="button"
              className={`search__filter ${
                filter === id ? "search__filter--on" : ""
              }`}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              <span aria-hidden="true">{glyph}</span>
              {label}
            </button>
          ))}
        </div>

        {searching ? (
          hits.length ? (
            <>
              <ul className="search__peeks" ref={listRef}>
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
                        {relativeDay(h.date, today)}
                      </span>
                      <span className="search__line">
                        <span className="search__linemark">
                          {glyphFor(h.line)}
                        </span>
                        {highlight(h.line.text, query)}
                        {isTaskKind(h.line) && h.line.due ? (
                          <span className="search__due">
                            {relativeDay(h.line.due, today)}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="search__count">
                {all.length > LIMIT
                  ? `first ${LIMIT} of ${all.length} — keep typing to narrow it`
                  : `${all.length} ${all.length === 1 ? "line" : "lines"}`}
              </p>
            </>
          ) : (
            <p className="search__empty">Nothing on any page.</p>
          )
        ) : null}
      </div>
    </Sheet>
  );
}

function highlight(text: string, q: string) {
  if (q.length < 2) return text;
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
