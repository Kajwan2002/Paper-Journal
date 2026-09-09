import { createRoot } from "react-dom/client";
import { App } from "@/App";
import "@/styles/tokens.css";
import "@/styles/global.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

// NOTE: React StrictMode is intentionally omitted — its dev-only double
// mount/unmount detaches @react-spring/web v9 imperative SpringRefs from
// their live SpringValues, breaking the page-turn animation.
createRoot(rootEl).render(<App />);
