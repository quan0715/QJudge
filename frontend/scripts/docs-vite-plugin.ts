import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { parseDocMarkdown } from "../src/core/docs/frontmatter.utils";
import { stripMarkdownSyntax } from "../src/core/docs/search.usecase";
import type { DocSearchEntry, DocSiteConfig } from "../src/core/docs/docs.types";

export interface DocsSitePluginOptions {
  /** Directory containing `docs/config.json` and `docs/{lang}/*.md` (defaults to `<root>/public`). */
  publicDir: string;
  /** Output directory relative to root or absolute (defaults to `dist-docs`). */
  outDir: string;
  /** Public canonical URL used in sitemap.xml, robots.txt, and llms.txt. */
  publicUrl: string;
  /** Human-readable documentation site title used in llms.txt. */
  siteTitle?: string;
  /** Languages to generate search indexes for. */
  languages?: string[];
  /** Subdirectories inside `publicDir` to include in isolated docs build. */
  allowedPublicDirs?: string[];
  /** Preferred language for llms.txt / llms-full.txt (falls back to config.fallbackLanguage). */
  llmsLanguage?: string;
}

const DEFAULT_LANGUAGES = ["en", "ja", "ko", "zh-TW"];
const DEFAULT_ALLOWED_PUBLIC_DIRS = ["docs", "brand", "fonts"];

const MIME_TYPES: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".css": "text/css; charset=utf-8",
};

function readSiteConfig(docsDir: string): DocSiteConfig {
  const configPath = path.join(docsDir, "config.json");
  return JSON.parse(fs.readFileSync(configPath, "utf-8")) as DocSiteConfig;
}

function readMarkdownWithFallback(
  docsDir: string,
  slug: string,
  lang: string,
  fallbackLang: string,
): { raw: string; resolvedLang: string } | null {
  const primaryPath = path.join(docsDir, lang, `${slug}.md`);
  if (fs.existsSync(primaryPath)) {
    return {
      raw: fs.readFileSync(primaryPath, "utf-8"),
      resolvedLang: lang,
    };
  }

  if (lang !== fallbackLang) {
    const fallbackPath = path.join(docsDir, fallbackLang, `${slug}.md`);
    if (fs.existsSync(fallbackPath)) {
      return {
        raw: fs.readFileSync(fallbackPath, "utf-8"),
        resolvedLang: fallbackLang,
      };
    }
  }

  return null;
}

function buildSearchIndexForLanguage(
  docsDir: string,
  config: DocSiteConfig,
  lang: string,
  fallbackLang: string,
): DocSearchEntry[] {
  const entries: DocSearchEntry[] = [];

  for (const section of config.sections) {
    for (const slug of section.items) {
      const file = readMarkdownWithFallback(docsDir, slug, lang, fallbackLang);
      if (!file) continue;

      const parsed = parseDocMarkdown(file.raw);
      entries.push({
        slug,
        lang: file.resolvedLang,
        sectionId: section.id,
        title: parsed.title || slug,
        description: parsed.frontmatter.description,
        content: stripMarkdownSyntax(parsed.body),
        headings: parsed.toc.map((item) => item.text),
      });
    }
  }

  return entries;
}

function buildSitemapXml(publicUrl: string, config: DocSiteConfig): string {
  const normalizedUrl = publicUrl.replace(/\/$/, "");
  const lastModified = new Date().toISOString().slice(0, 10);
  const slugs = config.sections.flatMap((section) => section.items);

  const urls = [
    [
      "  <url>",
      `    <loc>${normalizedUrl}/</loc>`,
      `    <lastmod>${lastModified}</lastmod>`,
      "    <changefreq>weekly</changefreq>",
      "    <priority>1.0</priority>",
      "  </url>",
    ].join("\n"),
    ...slugs.map((slug) =>
      [
        "  <url>",
        `    <loc>${normalizedUrl}/#/docs/${slug}</loc>`,
        `    <lastmod>${lastModified}</lastmod>`,
        "    <changefreq>weekly</changefreq>",
        "    <priority>0.8</priority>",
        "  </url>",
      ].join("\n"),
    ),
  ];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

function buildRobotsTxt(publicUrl: string): string {
  const normalizedUrl = publicUrl.replace(/\/$/, "");
  return [
    "User-agent: *",
    "Allow: /",
    `Sitemap: ${normalizedUrl}/sitemap.xml`,
    "",
  ].join("\n");
}

function buildLlmsOutputs(
  docsDir: string,
  config: DocSiteConfig,
  options: {
    publicUrl: string;
    siteTitle: string;
    llmsLang: string;
    fallbackLang: string;
  },
): { llmsTxt: string; llmsFullTxt: string } {
  const normalizedUrl = options.publicUrl.replace(/\/$/, "");
  const indexLines: string[] = [
    `# ${options.siteTitle}`,
    "",
    `> Documentation index for ${options.siteTitle} (${normalizedUrl})`,
    "",
  ];
  const fullChunks: string[] = [`# ${options.siteTitle}`, ""];

  for (const section of config.sections) {
    indexLines.push(`## ${section.title || section.id}`, "");
    for (const slug of section.items) {
      const file = readMarkdownWithFallback(
        docsDir,
        slug,
        options.llmsLang,
        options.fallbackLang,
      );
      if (!file) continue;

      const parsed = parseDocMarkdown(file.raw);
      const title = parsed.title || slug;
      const summary = parsed.frontmatter.description
        ? `: ${parsed.frontmatter.description}`
        : "";
      const docUrl = `${normalizedUrl}/#/docs/${slug}`;

      indexLines.push(`- [${title}](${docUrl})${summary}`);
      fullChunks.push(
        `---`,
        `url: ${docUrl}`,
        `section: ${section.id}`,
        `slug: ${slug}`,
        `lang: ${file.resolvedLang}`,
        `---`,
        "",
        `# ${title}`,
        "",
        parsed.body.trim(),
        "",
      );
    }
    indexLines.push("");
  }

  return {
    llmsTxt: indexLines.join("\n"),
    llmsFullTxt: fullChunks.join("\n"),
  };
}

function copyDirectoryRecursive(srcDir: string, destDir: string): void {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export function docsSitePlugin(options: DocsSitePluginOptions): Plugin {
  const languages = options.languages ?? DEFAULT_LANGUAGES;
  const allowedPublicDirs =
    options.allowedPublicDirs ?? DEFAULT_ALLOWED_PUBLIC_DIRS;
  const siteTitle = options.siteTitle ?? "QJudge Docs";
  const llmsLang = options.llmsLanguage ?? "en";

  return {
    name: "carbon-docs-site-pipeline",
    configureServer(server) {
      const docsDir = path.join(options.publicDir, "docs");

      server.middlewares.use((req, res, next) => {
        const rawUrl = (req.url || "").split("?")[0];
        if (!rawUrl) {
          next();
          return;
        }

        try {
          const config = readSiteConfig(docsDir);
          const fallbackLang = config.fallbackLanguage || "zh-TW";

          const indexMatch = rawUrl.match(/^\/docs\/search-index\.([^/]+)\.json$/);
          if (indexMatch) {
            const lang = indexMatch[1];
            const entries = buildSearchIndexForLanguage(
              docsDir,
              config,
              lang,
              fallbackLang,
            );
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify(entries));
            return;
          }

          if (rawUrl === "/sitemap.xml") {
            res.setHeader("Content-Type", "application/xml; charset=utf-8");
            res.end(buildSitemapXml(options.publicUrl, config));
            return;
          }

          if (rawUrl === "/robots.txt") {
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end(buildRobotsTxt(options.publicUrl));
            return;
          }

          if (rawUrl === "/llms.txt" || rawUrl === "/llms-full.txt") {
            const { llmsTxt, llmsFullTxt } = buildLlmsOutputs(docsDir, config, {
              publicUrl: options.publicUrl,
              siteTitle,
              llmsLang,
              fallbackLang,
            });
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end(rawUrl === "/llms.txt" ? llmsTxt : llmsFullTxt);
            return;
          }

          const allowedDir = allowedPublicDirs.find(
            (dir) => rawUrl === `/${dir}` || rawUrl.startsWith(`/${dir}/`),
          );
          if (allowedDir) {
            const allowedRoot = path.resolve(options.publicDir, allowedDir);
            const targetPath = path.resolve(
              options.publicDir,
              rawUrl.replace(/^\/+/, ""),
            );
            if (
              targetPath.startsWith(allowedRoot + path.sep) &&
              fs.existsSync(targetPath) &&
              fs.statSync(targetPath).isFile()
            ) {
              const ext = path.extname(targetPath).toLowerCase();
              res.setHeader(
                "Content-Type",
                MIME_TYPES[ext] || "application/octet-stream",
              );
              fs.createReadStream(targetPath).pipe(res);
              return;
            }
          }
        } catch (err) {
          console.error("docsSitePlugin dev middleware error:", err);
        }

        next();
      });
    },
    closeBundle() {
      const docsDir = path.join(options.publicDir, "docs");
      const outDir = path.resolve(options.outDir);
      const outDocsDir = path.join(outDir, "docs");

      // 1. Copy only isolated public directories needed for docs (no product assets)
      for (const dirName of allowedPublicDirs) {
        copyDirectoryRecursive(
          path.join(options.publicDir, dirName),
          path.join(outDir, dirName),
        );
      }

      const config = readSiteConfig(docsDir);
      const fallbackLang = config.fallbackLanguage || "zh-TW";
      fs.mkdirSync(outDocsDir, { recursive: true });

      // 2. Emit prebuilt search index per language
      for (const lang of languages) {
        const entries = buildSearchIndexForLanguage(
          docsDir,
          config,
          lang,
          fallbackLang,
        );
        fs.writeFileSync(
          path.join(outDocsDir, `search-index.${lang}.json`),
          JSON.stringify(entries),
        );
      }

      // 3. Emit full sitemap.xml and robots.txt
      fs.writeFileSync(
        path.join(outDir, "robots.txt"),
        buildRobotsTxt(options.publicUrl),
      );
      fs.writeFileSync(
        path.join(outDir, "sitemap.xml"),
        buildSitemapXml(options.publicUrl, config),
      );

      // 4. Emit Fumadocs-style llms.txt & llms-full.txt
      const { llmsTxt, llmsFullTxt } = buildLlmsOutputs(docsDir, config, {
        publicUrl: options.publicUrl,
        siteTitle,
        llmsLang,
        fallbackLang,
      });
      fs.writeFileSync(path.join(outDir, "llms.txt"), llmsTxt);
      fs.writeFileSync(path.join(outDir, "llms-full.txt"), llmsFullTxt);
    },
  };
}
