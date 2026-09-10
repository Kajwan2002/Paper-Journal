import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "node:path";

// https://vite.dev/config/
// On GitHub Pages the app is served from /<repo>/, locally from /.
const base = process.env.GITHUB_ACTIONS ? "/Paper-Journal/" : "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    // The brief says "everything works fully offline" and until now nothing
    // did — there was a manifest but no service worker, so a phone with no
    // signal got a blank page. Precache the shell, the fonts and the icons;
    // the journal itself was always local.
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icon.svg",
        "icon-maskable.svg",
        "apple-touch-icon.png",
        "icon-192.png",
        "icon-512.png",
        "icon-maskable-512.png",
      ],
      manifest: false, // public/manifest.webmanifest is the source of truth
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2,png,svg,webmanifest}"],
        cleanupOutdatedCaches: true,
        navigateFallback: `${base}index.html`,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
