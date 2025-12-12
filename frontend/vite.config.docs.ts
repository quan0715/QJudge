import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

// Plugin to rename docs.html to index.html after build
function renameDocsToIndex(): Plugin {
  return {
    name: "rename-docs-to-index",
    closeBundle() {
      const docsPath = path.resolve(__dirname, "dist-docs/docs.html");
      const indexPath = path.resolve(__dirname, "dist-docs/index.html");
      if (fs.existsSync(docsPath)) {
        fs.renameSync(docsPath, indexPath);
        console.log("✓ Renamed docs.html to index.html");
      }
    },
  };
}

// Vite config for standalone documentation build (GitHub Pages)
export default defineConfig({
  plugins: [react(), renameDocsToIndex()],
  base: "/QJudge/", // GitHub repo name for GitHub Pages
  define: {
    // Main app URL for "Go to Dashboard" button
    "import.meta.env.VITE_MAIN_APP_URL": JSON.stringify("https://q-judge.quan.wtf"),
  },
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
