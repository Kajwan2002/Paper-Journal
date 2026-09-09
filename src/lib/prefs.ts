import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeChoice = "system" | "light" | "dark";

interface PrefsState {
  theme: ThemeChoice;
  /** the cover catches light by time of day */
  ambientLight: boolean;
  setTheme: (t: ThemeChoice) => void;
  toggleAmbient: () => void;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      theme: "system",
      ambientLight: true,
      setTheme: (theme) => set({ theme }),
      toggleAmbient: () => set((s) => ({ ambientLight: !s.ambientLight })),
    }),
    { name: "marginalia.prefs" },
  ),
);

/** Reflect the theme choice onto <html data-theme> so tokens.css can react. */
export function applyTheme(choice: ThemeChoice): void {
  const el = document.documentElement;
  if (choice === "system") delete el.dataset.theme;
  else el.dataset.theme = choice;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
