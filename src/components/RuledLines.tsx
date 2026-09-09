import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  GLYPH,
  cycleKind,
  newLine,
  parseLine,
  type Line,
} from "@/lib/rapidlog";
import "./ruled-lines.css";

interface Props {
  lines: Line[];
  onChange: (lines: Line[]) => void;
  /** faint prompt shown when the page is completely empty */
  placeholder?: string;
}

export function RuledLines({ lines, onChange, placeholder }: Props) {
  const inputs = useRef<Map<string, HTMLInputElement>>(new Map());
  const [focusId, setFocusId] = useState<string | null>(null);

  // Ensure there is always one trailing line to type into.
  const rows = lines.length > 0 ? lines : [newLine()];

  useEffect(() => {
    if (focusId) {
      const el = inputs.current.get(focusId);
      el?.focus();
      const v = el?.value ?? "";
      el?.setSelectionRange(v.length, v.length);
      setFocusId(null);
    }
  }, [focusId]);

  const commit = useCallback(
    (next: Line[]) => {
      onChange(next.length > 0 ? next : [newLine()]);
    },
    [onChange],
  );

  const editText = (id: string, raw: string) => {
    const idx = rows.findIndex((l) => l.id === id);
    if (idx < 0) return;
    const current = rows[idx];
    const parsed = parseLine(raw);
    // Only switch kind when a signifier prefix was actually typed;
    // a plain note stays whatever it was (e.g. a task you're still writing).
    const kind =
      parsed.text !== raw
        ? parsed.kind
        : current.kind === "note"
          ? "note"
          : current.kind;
    const next = [...rows];
    next[idx] = { ...current, kind, text: parsed.text };
    commit(next);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>, id: string) => {
    const idx = rows.findIndex((l) => l.id === id);
    if (idx < 0) return;

    if (e.key === "Enter") {
      e.preventDefault();
      // tasks tend to come in runs; everything else drops back to a plain line
      const prevKind = rows[idx].kind;
      const created = newLine(
        prevKind === "task" || prevKind === "done" ? "task" : "note",
      );
      const next = [...rows];
      next.splice(idx + 1, 0, created);
      commit(next);
      setFocusId(created.id);
    }

    if (e.key === "Backspace" && rows[idx].text === "" && rows.length > 1) {
      e.preventDefault();
      const next = rows.filter((l) => l.id !== id);
      commit(next);
      const prev = rows[idx - 1];
      if (prev) setFocusId(prev.id);
    }

    if (e.key === "ArrowUp" && idx > 0) {
      e.preventDefault();
      setFocusId(rows[idx - 1].id);
    }
    if (e.key === "ArrowDown" && idx < rows.length - 1) {
      e.preventDefault();
      setFocusId(rows[idx + 1].id);
    }
  };

  const tapGlyph = (id: string) => {
    const next = rows.map((l) =>
      l.id === id ? { ...l, kind: cycleKind(l.kind) } : l,
    );
    commit(next);
  };

  const pageEmpty = rows.length === 1 && rows[0].text === "";

  return (
    <div className="ruled">
      {rows.map((line) => (
        <div key={line.id} className={`ruled__row ruled__row--${line.kind}`}>
          <button
            type="button"
            className="ruled__glyph"
            tabIndex={-1}
            aria-label={`Mark line as ${line.kind === "task" ? "done" : "task"}`}
            onClick={() => tapGlyph(line.id)}
          >
            {GLYPH[line.kind]}
          </button>
          <input
            ref={(el) => {
              if (el) inputs.current.set(line.id, el);
              else inputs.current.delete(line.id);
            }}
            className="ruled__input"
            value={line.text}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => editText(line.id, e.target.value)}
            onKeyDown={(e) => onKey(e, line.id)}
          />
        </div>
      ))}
      {pageEmpty && placeholder ? (
        <p className="ruled__placeholder" aria-hidden="true">
          {placeholder}
        </p>
      ) : null}
    </div>
  );
}
