import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  // Repo name must match — assets resolve relative to /LeagueOfFun/ on Pages.
  base: process.env.GITHUB_ACTIONS ? "/LeagueOfFun/" : "/",
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
});
