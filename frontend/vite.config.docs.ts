import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Vite config for standalone documentation build (GitHub Pages)
export default defineConfig({
  plugins: [react()],
  base: "/QJudge/", // GitHub repo name for GitHub Pages
  build: {
    outDir: "dist-docs",
    rollupOptions: {
      input: path.resolve(__dirname, "docs.html"),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "~": path.resolve(__dirname, "./node_modules"),
    },
  },
});
