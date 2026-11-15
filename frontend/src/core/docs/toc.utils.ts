import type { DocTocItem } from "./docs.types";

/**
 * Strip fenced code blocks (` ``` ` and `~~~`) while preserving line count
 * so heading extraction never picks up `# comments` inside code snippets.
 */
export function stripFencedCodeBlocks(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  let activeFence: { char: "`" | "~"; length: number } | null = null;

  for (const line of lines) {
    const trimmed = line.trimStart();
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})(.*)$/);

    if (!activeFence) {
      if (fenceMatch) {
        const marker = fenceMatch[1];
        const char = marker[0] as "`" | "~";
        activeFence = { char, length: marker.length };
        output.push("");
        continue;
      }
      output.push(line);
    } else {
      if (
        fenceMatch &&
        fenceMatch[1][0] === activeFence.char &&
        fenceMatch[1].length >= activeFence.length &&
        fenceMatch[2].trim() === ""
      ) {
        activeFence = null;
      }
      output.push("");
    }
  }

  return output.join("\n");
}

function cleanHeadingText(raw: string): string {
  return raw
    .replace(/\s+#+\s*$/, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .trim();
}

/**
 * Generate a GitHub-compatible heading slug (matching rehype-slug / github-slugger).
 */
export function slugifyHeading(
  text: string,
  occurrences?: Map<string, number>,
): string {
  const baseSlug = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_ -]+/gu, "")
    .replace(/ /g, "-");

  if (!occurrences) {
    return baseSlug;
  }

  let candidate = baseSlug;
  while (occurrences.has(candidate)) {
    const nextCount = (occurrences.get(baseSlug) ?? 0) + 1;
    occurrences.set(baseSlug, nextCount);
    candidate = `${baseSlug}-${nextCount}`;
  }

  occurrences.set(candidate, 0);
  return candidate;
}

/**
 * Extract level 2 and 3 headings (`##` and `###`) for the table of contents,
 * ignoring any headings inside fenced code blocks.
 */
export function extractDocToc(markdown: string): DocTocItem[] {
  const cleaned = stripFencedCodeBlocks(markdown);
  const occurrences = new Map<string, number>();
  const headingRegex = /^(#{2,3})\s+(.+)$/gm;
  const items: DocTocItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(cleaned)) !== null) {
    const level = match[1].length;
    const text = cleanHeadingText(match[2]);
    if (!text) continue;
    const id = slugifyHeading(text, occurrences);
    items.push({ id, text, level });
  }

  return items;
}
