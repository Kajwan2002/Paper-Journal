import { useCallback, useEffect, useRef, useState } from "react";
import {
  addNotebook,
  deleteNotebook,
  listNotebooks,
  pageCount,
  updateNotebook,
  type CoverStyle,
  type Notebook,
  type PaperStyle,
} from "@/lib/db";
import {
  backupFilename,
  download,
  exportJson,
  exportMarkdown,
  importBackup,
} from "@/lib/backup";
import {
  isPersisted,
  requestPersistence,
  storageEstimate,
} from "@/lib/persist";
import { Sheet } from "@/components/Sheet";
import { Sync } from "@/components/Sync";
import "./settings.css";

const COVERS: Array<[CoverStyle, string]> = [
  ["oxblood", "Oxblood"],
  ["tan", "Tan"],
  ["forest", "Forest"],
  ["black-cloth", "Black cloth"],
];

const PAPERS: Array<[PaperStyle, string]> = [
  ["cream-lined", "Ruled"],
  ["dot-grid", "Dot grid"],
  ["blank", "Blank"],
];

interface Props {
  notebook: Notebook;
  onChanged: () => void;
  onOpenNotebook: (id: string) => void;
  onClose: () => void;
}

export function Settings({
  notebook,
  onChanged,
  onOpenNotebook,
  onClose,
}: Props) {
  const [title, setTitle] = useState(notebook.title);
  const [shelf, setShelf] = useState<Notebook[]>([]);
  const [safe, setSafe] = useState<boolean | null>(null);
  const [disk, setDisk] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pages, setPages] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadShelf = useCallback(() => {
    void listNotebooks().then(setShelf);
  }, []);

  useEffect(() => {
    void pageCount(notebook.id).then(setPages);
  }, [notebook.id]);

  // switching notebooks must never leave a "delete it?" armed against the
  // one you just moved to — React's adjust-state-during-render pattern
  const [armedFor, setArmedFor] = useState(notebook.id);
  if (armedFor !== notebook.id) {
    setArmedFor(notebook.id);
    setConfirming(false);
  }

  useEffect(() => {
    loadShelf();
    void isPersisted().then(setSafe);
    void storageEstimate().then((e) => {
      if (e) setDisk(`${e.usedMB.toFixed(1)} MB used`);
    });
  }, [loadShelf]);

  const set = async (patch: Partial<Omit<Notebook, "id">>) => {
    await updateNotebook(notebook.id, patch);
    loadShelf();
    onChanged();
  };

  const onImport = async (file: File) => {
    try {
      const result = await importBackup(await file.text());
      setNote(
        result.pages === 0
          ? "Already had everything in that file."
          : `Merged ${result.pages} ${result.pages === 1 ? "page" : "pages"}.`,
      );
      loadShelf();
      onChanged();

      // A restore onto a fresh device used to land silently in a second
      // notebook while the reader stared at the empty one first-run had
      // just made them. If this notebook is untouched, open theirs.
      const landed = result.restored.find((id) => id !== notebook.id);
      if (landed && (await pageCount(notebook.id)) === 0) {
        onOpenNotebook(landed);
      }
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Couldn't read that file.");
    }
  };

  return (
    <Sheet label="Notebook" onClose={onClose}>
      <h2 className="sheet__title">This notebook</h2>
      <div className="sheet__body">
        <label className="set__field">
          <span className="set__label">Title</span>
          <input
            className="set__input"
            value={title}
            maxLength={40}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void set({ title: title.trim() || "Journal" })}
          />
        </label>

        {shelf.length > 1 ? (
          <fieldset className="set__group">
            <legend className="set__label">On the shelf</legend>
            <div className="set__row">
              {shelf.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`sheet__btn ${
                    n.id === notebook.id ? "sheet__btn--on" : ""
                  }`}
                  aria-pressed={n.id === notebook.id}
                  onClick={() => onOpenNotebook(n.id)}
                >
                  {n.title}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        <fieldset className="set__group">
          <legend className="set__label">Cover</legend>
          <div className="set__swatches">
            {COVERS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`set__swatch set__swatch--${id} ${
                  notebook.cover === id ? "set__swatch--on" : ""
                }`}
                aria-pressed={notebook.cover === id}
                aria-label={label}
                title={label}
                onClick={() => void set({ cover: id })}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="set__group">
          <legend className="set__label">Paper</legend>
          <div className="set__row">
            {PAPERS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`sheet__btn ${
                  notebook.paper === id ? "sheet__btn--on" : ""
                }`}
                aria-pressed={notebook.paper === id}
                onClick={() => void set({ paper: id })}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <Sync />

        <fieldset className="set__group">
          <legend className="set__label">Keeping it safe</legend>
          <p className="set__note">
            Everything is stored on this device only. Browsers are allowed to
            clear that — take a copy somewhere you trust.
            {disk ? ` ${disk}.` : ""}
          </p>
          <div className="set__row">
            <button
              type="button"
              className="sheet__btn"
              onClick={() =>
                void exportJson().then((b) =>
                  download(b, backupFilename("json")),
                )
              }
            >
              Export ·json
            </button>
            <button
              type="button"
              className="sheet__btn"
              onClick={() =>
                void exportMarkdown().then((b) =>
                  download(b, backupFilename("md")),
                )
              }
            >
              Export ·md
            </button>
            <button
              type="button"
              className="sheet__btn"
              onClick={() => fileRef.current?.click()}
            >
              Import
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void onImport(file);
              }}
            />
            <button
              type="button"
              className="sheet__btn"
              onClick={() =>
                void addNotebook(`Journal ${shelf.length + 1}`).then((n) => {
                  loadShelf();
                  onOpenNotebook(n.id);
                })
              }
            >
              New notebook
            </button>
          </div>
          {safe === false ? (
            <button
              type="button"
              className="set__persist"
              onClick={() => void requestPersistence().then(setSafe)}
            >
              Ask the browser not to evict this journal
            </button>
          ) : safe ? (
            <p className="set__ok">
              This browser has promised not to evict the journal.
            </p>
          ) : null}
          {note ? (
            <p className="set__ok" role="status">
              {note}
            </p>
          ) : null}
        </fieldset>

        {shelf.length > 1 ? (
          <fieldset className="set__group">
            <legend className="set__label">Bin this notebook</legend>
            {confirming ? (
              <>
                <p className="set__note set__note--warn">
                  Delete “{notebook.title}” and the{" "}
                  {pages === 1 ? "one page" : `${pages ?? 0} pages`} written in
                  it? This cannot be undone — export first if you want a copy.
                </p>
                <div className="set__row">
                  <button
                    type="button"
                    className="sheet__btn sheet__btn--danger"
                    onClick={() =>
                      void deleteNotebook(notebook.id).then((gone) => {
                        if (!gone) {
                          setNote(
                            "That's the only notebook — nothing to fall back to.",
                          );
                          setConfirming(false);
                          return;
                        }
                        const next = shelf.find((n) => n.id !== notebook.id);
                        if (next) onOpenNotebook(next.id);
                        onChanged();
                      })
                    }
                  >
                    Delete it
                  </button>
                  <button
                    type="button"
                    className="sheet__btn"
                    onClick={() => setConfirming(false)}
                  >
                    Keep it
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className="sheet__btn sheet__btn--danger"
                onClick={() => setConfirming(true)}
              >
                Delete notebook
              </button>
            )}
          </fieldset>
        ) : null}
      </div>
    </Sheet>
  );
}
