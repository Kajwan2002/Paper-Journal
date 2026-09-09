import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { applyTheme, usePrefs } from "@/lib/prefs";
import "@/styles/tokens.css";
import "@/styles/global.css";

// reflect the saved theme before first paint
applyTheme(usePrefs.getState().theme);

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

// StrictMode is on: the page-turn uses a hand-rolled spring + imperative
// WebGL that both tolerate a dev double-mount.
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
