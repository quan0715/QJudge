import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

const landingPublicUrl = "https://www.q-judge.com";
const mainAppUrl = "https://q-judge.com";

function landingSeoFiles(): Plugin {
  return {
    name: "landing-seo-files",
    closeBundle() {
      const outDir = path.resolve(__dirname, "dist-landing");
      fs.writeFileSync(
        path.join(outDir, "robots.txt"),
        [
          "User-agent: *",
          "Allow: /",
          `Sitemap: ${landingPublicUrl}/sitemap.xml`,
          "",
        ].join("\n"),
      );
      fs.writeFileSync(
        path.join(outDir, "sitemap.xml"),
        [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
          '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
          "  <url>",
          `    <loc>${landingPublicUrl}/</loc>`,
          "    <lastmod>2026-04-25</lastmod>",
          "    <changefreq>weekly</changefreq>",
          "    <priority>1.0</priority>",
          `    <xhtml:link rel="alternate" hreflang="zh-TW" href="${landingPublicUrl}/" />`,
          `    <xhtml:link rel="alternate" hreflang="en" href="${landingPublicUrl}/" />`,
          `    <xhtml:link rel="alternate" hreflang="ja" href="${landingPublicUrl}/" />`,
          `    <xhtml:link rel="alternate" hreflang="ko" href="${landingPublicUrl}/" />`,
          `    <xhtml:link rel="alternate" hreflang="x-default" href="${landingPublicUrl}/" />`,
          "  </url>",
          "</urlset>",
          "",
        ].join("\n"),
      );
    },
  };
}

function renameLandingToIndex(): Plugin {
  return {
    name: "rename-landing-to-index",
    closeBundle() {
      const landingPath = path.resolve(__dirname, "dist-landing/landing.html");
      const indexPath = path.resolve(__dirname, "dist-landing/index.html");
      if (fs.existsSync(landingPath)) {
        fs.renameSync(landingPath, indexPath);
        console.log("✓ Renamed landing.html to index.html");
      }
    },
  };
}

function copyLandingWorker(): Plugin {
  return {
    name: "copy-landing-worker",
    closeBundle() {
      fs.copyFileSync(
        path.resolve(__dirname, "pages/landing-worker.js"),
        path.resolve(__dirname, "dist-landing/_worker.js"),
      );
      console.log("✓ Copied landing Pages Function");
    },
  };
}

export default defineConfig({
  plugins: [react(), landingSeoFiles(), renameLandingToIndex(), copyLandingWorker()],
  base: "/",
  define: {
    "import.meta.env.VITE_LANDING_PUBLIC_URL": JSON.stringify(landingPublicUrl),
    "import.meta.env.VITE_MAIN_APP_URL": JSON.stringify(mainAppUrl),
  },
  build: {
    outDir: "dist-landing",
    rollupOptions: {
      input: path.resolve(__dirname, "landing.html"),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "~": path.resolve(__dirname, "./node_modules"),
    },
  },
});
