import { usePrefs, applyTheme, type ThemeChoice } from "@/lib/prefs";
import { useSession } from "@/state/session";
import { useOverlay } from "@/state/overlay";
import "./desk-controls.css";

const NEXT: Record<ThemeChoice, ThemeChoice> = {
  system: "light",
  light: "dark",
  dark: "system",
};

const GLYPH: Record<ThemeChoice, string> = {
  system: "◐",
  light: "☀",
  dark: "☾",
};

export function DeskControls({
  loops,
  overdue,
}: {
  loops: number;
  overdue: number;
}) {
  const theme = usePrefs((s) => s.theme);
  const setTheme = usePrefs((s) => s.setTheme);
  const open = useSession((s) => s.open);
  const show = useOverlay((s) => s.show);

  return (
    <div className="deskctl" role="group" aria-label="Notebook">
      {open ? (
        <>
          <button
            type="button"
            className="deskctl__btn deskctl__btn--loops"
            title="Open loops"
            aria-label={`Open loops${loops ? `: ${loops} outstanding` : ""}${
              overdue ? `, ${overdue} out of time` : ""
            }`}
            onClick={() => show("loops")}
          >
            ❧
            {loops ? (
              <span
                className={`deskctl__count ${
                  overdue ? "deskctl__count--late" : ""
                }`}
                aria-hidden="true"
              >
                {loops > 99 ? "99+" : loops}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className="deskctl__btn"
            title="Search the notebook"
            aria-label="Search the notebook"
            onClick={() => show("search")}
          >
            ⌕
          </button>
        </>
      ) : null}
      <button
        type="button"
        className="deskctl__btn"
        title={`Lamplight: ${theme}`}
        aria-label={`Lamplight: ${theme}. Tap to change.`}
        onClick={() => {
          const t = NEXT[theme];
          setTheme(t);
          applyTheme(t);
        }}
      >
        {GLYPH[theme]}
      </button>
      <button
        type="button"
        className="deskctl__btn"
        title="Notebook & backups"
        aria-label="Notebook and backups"
        onClick={() => show("settings")}
      >
        ⚙
      </button>
    </div>
  );
}
