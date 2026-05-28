import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ command }) => ({
  // `npm run dev` → "/". On a build, base depends on host:
  //   Render (auto-sets RENDER=true) → "/" (custom or *.onrender.com root)
  //   Anywhere else (GitHub Actions / local) → "/LeagueOfFun/" (Pages repo path)
  // Override with VITE_BASE if you ever need to deploy somewhere else.
  base:
    command === "build"
      ? process.env.VITE_BASE ?? (process.env.RENDER ? "/" : "/LeagueOfFun/")
      : "/",
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
