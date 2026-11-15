import { describe, expect, it } from "vitest";
import {
  extractDocToc,
  parseDocFrontmatter,
  parseDocMarkdown,
  searchDocEntries,
  slugifyHeading,
  type DocSearchEntry,
} from "./index";

describe("core/docs frontmatter & markdown parsing", () => {
  it("parses frontmatter metadata and separates it from markdown content", () => {
    const raw = `---
title: "Custom Deployment Title"
description: Single-host deployment guide
icon: server
lastUpdated: 2026-11-14
---

# Ignored Duplicate H1

## Prerequisites

Some body text.
`;

    const parsed = parseDocMarkdown(raw);
    expect(parsed.frontmatter).toEqual({
      title: "Custom Deployment Title",
      description: "Single-host deployment guide",
      icon: "server",
      lastUpdated: "2026-11-14",
    });
    expect(parsed.title).toBe("Custom Deployment Title");
    expect(parsed.body.trimStart().startsWith("## Prerequisites")).toBe(true);
    expect(parsed.toc).toEqual([
      { id: "prerequisites", text: "Prerequisites", level: 2 },
    ]);
  });

  it("falls back to leading H1 when frontmatter title is absent", () => {
    const raw = `# Platform Overview

Welcome to the platform.
`;
    const parsed = parseDocMarkdown(raw);
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.title).toBe("Platform Overview");
    expect(parsed.body.trim()).toBe("Welcome to the platform.");
  });

  it("handles markdown without frontmatter cleanly", () => {
    const { frontmatter, content } = parseDocFrontmatter("## Section Only\n");
    expect(frontmatter).toEqual({});
    expect(content).toBe("## Section Only\n");
  });
});

describe("core/docs TOC extraction", () => {
  it("ignores hash comments inside fenced code blocks", () => {
    const markdown = `
## Real Heading

\`\`\`bash
# This is a bash comment
## Not a heading
~~~
# Still inside backtick fence
\`\`\`

~~~python
### Not a python heading
~~~

### Real Subheading
`;

    expect(extractDocToc(markdown)).toEqual([
      { id: "real-heading", text: "Real Heading", level: 2 },
      { id: "real-subheading", text: "Real Subheading", level: 3 },
    ]);
  });

  it("deduplicates repeated headings and preserves CJK characters in slugs", () => {
    const markdown = `
## 步驟說明
### 常見問題
## 步驟說明
### 常見問題
`;

    expect(extractDocToc(markdown)).toEqual([
      { id: "步驟說明", text: "步驟說明", level: 2 },
      { id: "常見問題", text: "常見問題", level: 3 },
      { id: "步驟說明-1", text: "步驟說明", level: 2 },
      { id: "常見問題-1", text: "常見問題", level: 3 },
    ]);

    expect(slugifyHeading("API & Setup (v2)")).toBe("api--setup-v2");
  });
});

describe("core/docs search usecase", () => {
  const entries: DocSearchEntry[] = [
    {
      slug: "overview",
      lang: "en",
      sectionId: "getting-started",
      title: "Platform Overview",
      content: "QJudge supports classroom exams and deployment options.",
      headings: ["Features"],
    },
    {
      slug: "deployment",
      lang: "en",
      sectionId: "deployment",
      title: "Deployment Guide",
      content: "Install Docker and deploy on Ubuntu.",
      headings: ["Deployment Steps"],
    },
  ];

  it("ranks title and heading matches ahead of body-only matches", () => {
    const results = searchDocEntries(entries, "deployment", {
      resolveSection: (id) => `section:${id}`,
    });

    expect(results).toHaveLength(2);
    expect(results[0].slug).toBe("deployment");
    expect(results[0].section).toBe("section:deployment");
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[1].slug).toBe("overview");
  });

  it("returns empty array for queries shorter than 2 characters", () => {
    expect(searchDocEntries(entries, "a")).toEqual([]);
    expect(searchDocEntries(entries, " ")).toEqual([]);
  });
});
