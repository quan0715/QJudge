import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocSiteConfig } from "@/core/docs";
import { createStaticDocSource } from "./staticDocSource";

const sampleConfig: DocSiteConfig = {
  sections: [
    {
      id: "getting-started",
      items: ["overview"],
    },
  ],
  defaultDoc: "overview",
};

describe("shared/docs createStaticDocSource", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads page markdown, extracts frontmatter/title, and falls back to fallbackLang", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/docs/en/overview.md") {
        return new Response("Not found", { status: 404 });
      }
      if (url === "/docs/zh-TW/overview.md") {
        return new Response(
          `---
description: Overview description
lastUpdated: 2026-11-10
---
# 平台概覽

## 快速導覽
`,
          { status: 200 },
        );
      }
      return new Response("Not found", { status: 404 });
    });

    const source = createStaticDocSource({ basePath: "/" });
    const page = await source.loadPage("overview", "en", "zh-TW");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(page.lang).toBe("zh-TW");
    expect(page.title).toBe("平台概覽");
    expect(page.description).toBe("Overview description");
    expect(page.lastUpdated).toBe("2026-11-10");
    expect(page.toc).toEqual([{ id: "快速導覽", text: "快速導覽", level: 2 }]);
  });

  it("prefers prebuilt search-index.{lang}.json when available", async () => {
    const prebuiltEntries = [
      {
        slug: "overview",
        lang: "en",
        sectionId: "getting-started",
        title: "Overview",
        content: "Prebuilt content",
        headings: ["Intro"],
      },
    ];

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(prebuiltEntries), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const source = createStaticDocSource({ basePath: "/" });
    const entries = await source.loadSearchIndex("en", sampleConfig);

    expect(fetchMock).toHaveBeenCalledWith("/docs/search-index.en.json");
    expect(entries).toEqual(prebuiltEntries);
  });

  it("falls back to parsing markdown files when prebuilt search index is missing", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/docs/search-index.en.json") {
        return new Response("<!doctype html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (url === "/docs/en/overview.md") {
        return new Response("# Overview\n\n## Setup\n\nHello world.", {
          status: 200,
        });
      }
      return new Response("Not found", { status: 404 });
    });

    const source = createStaticDocSource({ basePath: "/" });
    const entries = await source.loadSearchIndex("en", sampleConfig);

    expect(entries).toEqual([
      {
        slug: "overview",
        lang: "en",
        sectionId: "getting-started",
        title: "Overview",
        description: undefined,
        content: "Setup Hello world.",
        headings: ["Setup"],
      },
    ]);
  });
});
