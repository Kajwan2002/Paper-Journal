import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// https://vite.dev/config/
// On GitHub Pages the app is served from /<repo>/, locally from /.
const base = process.env.GITHUB_ACTIONS ? "/Paper-Journal/" : "/";

export default defineConfig({
  base,
  plugins: [react()],
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
