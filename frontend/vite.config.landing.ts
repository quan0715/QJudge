import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import landingZhTW from "./src/i18n/locales/zh-TW/landing.json";

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
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">',
          `  <url><loc>${landingPublicUrl}/</loc></url>`,
          `  <url><loc>${landingPublicUrl}/demo/</loc>`,
          "    <video:video>",
          `      <video:thumbnail_loc>${landingPublicUrl}/media/QJudge-launch-v4.jpg</video:thumbnail_loc>`,
          "      <video:title>QJudge 產品影片｜大專課程評量與 AI 輔助批改</video:title>",
          "      <video:description>從命題、考試管理到 AI 輔助批改與考後分析，認識 QJudge 的課程評量流程。</video:description>",
          `      <video:content_loc>${landingPublicUrl}/media/QJudge-launch-v4.mp4</video:content_loc>`,
          "      <video:duration>87</video:duration>",
          "    </video:video>",
          "  </url>",
          "</urlset>",
          "",
        ].join("\n"),
      );
    },
  };
}

// Public copy is available before JavaScript runs. React replaces this with the
// interactive page using the same translation source; no separate crawler view.
function landingReadableHtml(): Plugin {
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  return {
    name: "landing-readable-html",
    transformIndexHtml(html, context) {
      if (!context.filename.endsWith("landing.html")) return html;
      const c = landingZhTW;
      const sections = [c.proposition, c.flow, c.audience, c.socialProof];
      const content = `<main class="landing-section">
        <h1>${escape(c.hero.title)}</h1><p>${escape(c.hero.subtitle)}</p>
        <p><a href="${mainAppUrl}/register">${escape(c.hero.primaryCta)}</a> · <a href="/demo/">${escape(c.video.link)}</a></p>
        <section><h2>${escape(c.video.title)}</h2><p>${escape(c.video.description)}</p>
          <video controls playsinline preload="none" width="1920" height="1080" style="width:100%;height:auto;max-width:80rem" poster="/media/QJudge-launch-v4.jpg" aria-label="${escape(c.video.title)}"><source src="/media/QJudge-launch-v4.mp4" type="video/mp4"></video>
        </section>
        ${sections.map(section => `<section><h2>${escape(section.title)}</h2><p>${escape(section.description)}</p></section>`).join("\n")}
        <section><h2>${escape(c.faq.title)}</h2>${c.faq.items.map(item => `<h3>${escape(item.question)}</h3><p>${escape(item.answer)}</p>`).join("\n")}</section>
      </main>`;
      return html.replace('<div id="root"></div>', `<div id="root">${content}</div>`);
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
  plugins: [react(), landingReadableHtml(), landingSeoFiles(), renameLandingToIndex(), copyLandingWorker()],
  base: "/",
  define: {
    "import.meta.env.VITE_LANDING_PUBLIC_URL": JSON.stringify(landingPublicUrl),
    "import.meta.env.VITE_MAIN_APP_URL": JSON.stringify(mainAppUrl),
  },
  build: {
    outDir: "dist-landing",
    rollupOptions: {
      input: {
        landing: path.resolve(__dirname, "landing.html"),
        demo: path.resolve(__dirname, "demo/index.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "~": path.resolve(__dirname, "./node_modules"),
    },
  },
});
