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

export function DeskControls() {
  const theme = usePrefs((s) => s.theme);
  const setTheme = usePrefs((s) => s.setTheme);
  const open = useSession((s) => s.open);
  const openSearch = useOverlay((s) => s.openSearch);

  return (
    <div className="deskctl" role="group" aria-label="Notebook settings">
      {open ? (
        <button
          type="button"
          className="deskctl__btn"
          title="Search the notebook"
          aria-label="Search the notebook"
          onClick={openSearch}
        >
          ⌕
        </button>
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
    </div>
  );
}
