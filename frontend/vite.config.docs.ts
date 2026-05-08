import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

const docsPublicUrl = "https://docs.q-judge.com";
const mainAppUrl = "https://q-judge.com";

function docsSeoFiles(): Plugin {
  return {
    name: "docs-seo-files",
    closeBundle() {
      const outDir = path.resolve(__dirname, "dist-docs");
      fs.writeFileSync(
        path.join(outDir, "robots.txt"),
        [
          "User-agent: *",
          "Allow: /",
          `Sitemap: ${docsPublicUrl}/sitemap.xml`,
          "",
        ].join("\n"),
      );
      fs.writeFileSync(
        path.join(outDir, "sitemap.xml"),
        [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          "  <url>",
          `    <loc>${docsPublicUrl}/</loc>`,
          "    <lastmod>2026-05-08</lastmod>",
          "    <changefreq>weekly</changefreq>",
          "    <priority>1.0</priority>",
          "  </url>",
          "</urlset>",
          "",
        ].join("\n"),
      );
    },
  };
}

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
  plugins: [react(), docsSeoFiles(), renameDocsToIndex(), copyDocsWorker()],
  base: "/",
  define: {
    "import.meta.env.VITE_DOCS_PUBLIC_URL": JSON.stringify(docsPublicUrl),
    "import.meta.env.VITE_MAIN_APP_URL": JSON.stringify(mainAppUrl),
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
