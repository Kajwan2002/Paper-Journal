import { usePrefs, applyTheme, type ThemeChoice } from "@/lib/prefs";
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

  return (
    <div className="deskctl" role="group" aria-label="Notebook settings">
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
