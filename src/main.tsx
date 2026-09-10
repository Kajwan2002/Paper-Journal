import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { Boundary } from "@/components/Boundary";
import { applyTheme, usePrefs } from "@/lib/prefs";
import { registerSW } from "virtual:pwa-register";
import "@/styles/fonts.css";
import "@/styles/tokens.css";
import "@/styles/global.css";

// reflect the saved theme before first paint
applyTheme(usePrefs.getState().theme);

// Offline is the whole point of a local-first journal. Updates land on the
// next launch rather than swapping the page out from under a sentence.
registerSW({ immediate: true });

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

// StrictMode is on: the page-turn uses a hand-rolled spring + imperative
// WebGL that both tolerate a dev double-mount.
createRoot(rootEl).render(
  <StrictMode>
    <Boundary>
      <App />
    </Boundary>
  </StrictMode>,
);
