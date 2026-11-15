import type { DocFrontmatter, DocParsedMarkdown } from "./docs.types";
import { extractDocToc } from "./toc.utils";

const FRONTMATTER_REGEX = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const LEADING_TITLE_REGEX = /^\s*#\s+(.+)\r?\n*/;

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Parse simple YAML-style frontmatter key/value pairs from the top of a Markdown file.
 */
export function parseDocFrontmatter(raw: string): {
  frontmatter: DocFrontmatter;
  content: string;
} {
  const match = raw.match(FRONTMATTER_REGEX);
  if (!match) {
    return { frontmatter: {}, content: raw };
  }

  const frontmatter: DocFrontmatter = {};
  const lines = match[1].split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    const rawValue = trimmed.slice(colonIndex + 1);
    const value = unquote(rawValue);
    if (!value) continue;

    if (key === "title") frontmatter.title = value;
    else if (key === "description") frontmatter.description = value;
    else if (key === "icon") frontmatter.icon = value;
    else if (key === "lastUpdated") frontmatter.lastUpdated = value;
  }

  return {
    frontmatter,
    content: raw.slice(match[0].length),
  };
}

/**
 * Extract an article's leading `# Title` heading so it can be rendered in the page header.
 */
export function extractLeadingTitle(markdown: string): {
  title: string | null;
  body: string;
} {
  const match = markdown.match(LEADING_TITLE_REGEX);
  if (!match) {
    return { title: null, body: markdown };
  }

  return {
    title: match[1].trim(),
    body: markdown.slice(match[0].length),
  };
}

/**
 * Parse frontmatter, leading title, body, and TOC items from raw Markdown text.
 */
export function parseDocMarkdown(raw: string): DocParsedMarkdown {
  const { frontmatter, content } = parseDocFrontmatter(raw);
  const { title: leadingTitle, body } = extractLeadingTitle(content);
  const title = frontmatter.title ?? leadingTitle;
  const toc = extractDocToc(body);

  return {
    frontmatter,
    title,
    body,
    toc,
  };
}
