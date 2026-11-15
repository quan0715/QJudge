import {
  parseDocMarkdown,
  stripMarkdownSyntax,
  type DocContentSourcePort,
  type DocPageData,
  type DocSearchEntry,
  type DocSiteConfig,
} from "@/core/docs";

export interface StaticDocSourceOptions {
  basePath?: string;
  fallbackLanguage?: string;
}

function normalizeBasePath(basePath?: string): string {
  const raw = basePath ?? import.meta.env.BASE_URL ?? "/";
  return raw.endsWith("/") ? raw : `${raw}/`;
}

export function createStaticDocSource(
  options: StaticDocSourceOptions = {},
): DocContentSourcePort {
  const basePath = normalizeBasePath(options.basePath);
  const defaultFallbackLang = options.fallbackLanguage || "zh-TW";

  let configPromise: Promise<DocSiteConfig> | null = null;
  const searchIndexPromises = new Map<string, Promise<DocSearchEntry[]>>();

  const loadConfig = async (): Promise<DocSiteConfig> => {
    if (!configPromise) {
      configPromise = fetch(`${basePath}docs/config.json`).then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load docs config (${res.status})`);
        }
        return (await res.json()) as DocSiteConfig;
      }).catch((err) => {
        configPromise = null;
        throw err;
      });
    }
    return configPromise;
  };

  const loadPage = async (
    slug: string,
    lang: string,
    fallbackLang = defaultFallbackLang,
  ): Promise<DocPageData> => {
    let resolvedLang = lang;
    let res = await fetch(`${basePath}docs/${lang}/${slug}.md`);

    if (!res.ok && lang !== fallbackLang) {
      resolvedLang = fallbackLang;
      res = await fetch(`${basePath}docs/${fallbackLang}/${slug}.md`);
    }

    if (!res.ok) {
      throw new Error(`Document not found: ${slug}`);
    }

    const rawContent = await res.text();
    const parsed = parseDocMarkdown(rawContent);
    const lastUpdated =
      parsed.frontmatter.lastUpdated ||
      res.headers.get("Last-Modified") ||
      new Date().toISOString();

    return {
      slug,
      lang: resolvedLang,
      title: parsed.title,
      description: parsed.frontmatter.description,
      body: parsed.body,
      rawContent,
      lastUpdated,
      toc: parsed.toc,
    };
  };

  const tryLoadPrebuiltIndex = async (
    lang: string,
  ): Promise<DocSearchEntry[] | null> => {
    try {
      const res = await fetch(`${basePath}docs/search-index.${lang}.json`);
      if (!res.ok) return null;
      const contentType = res.headers.get("content-type") || "";
      if (contentType && !contentType.includes("json")) return null;
      const parsed: unknown = await res.json();
      return Array.isArray(parsed) ? (parsed as DocSearchEntry[]) : null;
    } catch {
      return null;
    }
  };

  const loadSearchIndex = async (
    lang: string,
    config: DocSiteConfig,
    fallbackLang = config.fallbackLanguage || defaultFallbackLang,
  ): Promise<DocSearchEntry[]> => {
    const cacheKey = `${lang}:${fallbackLang}`;
    const existing = searchIndexPromises.get(cacheKey);
    if (existing) return existing;

    const promise = (async () => {
      const prebuilt = await tryLoadPrebuiltIndex(lang);
      if (prebuilt) return prebuilt;

      const entries: Array<DocSearchEntry | null> = await Promise.all(
        config.sections.flatMap((section) =>
          section.items.map(async (slug) => {
            try {
              const page = await loadPage(slug, lang, fallbackLang);
              return {
                slug,
                lang: page.lang,
                sectionId: section.id,
                title: page.title || slug,
                description: page.description,
                content: stripMarkdownSyntax(page.body),
                headings: page.toc.map((item) => item.text),
              };
            } catch {
              return null;
            }
          }),
        ),
      );

      return entries.filter((entry): entry is DocSearchEntry => entry !== null);
    })().catch((err) => {
      searchIndexPromises.delete(cacheKey);
      throw err;
    });

    searchIndexPromises.set(cacheKey, promise);
    return promise;
  };

  return {
    loadConfig,
    loadPage,
    loadSearchIndex,
  };
}
