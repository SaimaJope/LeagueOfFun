import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ command }) => ({
  // Repo name must match — every `npm run build` resolves assets relative to
  // /LeagueOfFun/ so the bundle works on GitHub Pages. `npm run dev` stays on /
  // so localhost still loads.
  base: command === "build" ? "/LeagueOfFun/" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
}));
