import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import { docsSitePlugin } from "./scripts/docs-vite-plugin";

const docsPublicUrl = "https://docs.q-judge.com";
const mainAppUrl = "https://q-judge.com";

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

function copyDocsWorker(): Plugin {
  return {
    name: "copy-docs-worker",
    closeBundle() {
      fs.copyFileSync(
        path.resolve(__dirname, "pages/docs-worker.js"),
        path.resolve(__dirname, "dist-docs/_worker.js"),
      );
      console.log("✓ Copied docs Pages Function");
    },
  };
}

// Vite config for standalone documentation build (Cloudflare Pages)
export default defineConfig({
  plugins: [
    react(),
    docsSitePlugin({
      publicDir: path.resolve(__dirname, "public"),
      outDir: path.resolve(__dirname, "dist-docs"),
      publicUrl: docsPublicUrl,
      siteTitle: "QJudge Docs",
    }),
    renameDocsToIndex(),
    copyDocsWorker(),
  ],
  publicDir: false,
  base: "/",
  define: {
    "import.meta.env.VITE_DOCS_PUBLIC_URL": JSON.stringify(docsPublicUrl),
    "import.meta.env.VITE_MAIN_APP_URL": JSON.stringify(mainAppUrl),
  },
  build: {
    outDir: "dist-docs",
    emptyOutDir: true,
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
