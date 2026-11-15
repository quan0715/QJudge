import type { DocSearchEntry, DocSearchResult } from "./docs.types";

/**
 * Strip common Markdown syntax so excerpts and search text read cleanly.
 */
export function stripMarkdownSyntax(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function countOccurrences(text: string, query: string): number {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  if (!lowerQuery) return 0;

  let count = 0;
  let pos = 0;
  while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
    count += 1;
    pos += lowerQuery.length;
  }
  return count;
}

export function extractSearchExcerpt(
  content: string,
  searchQuery: string,
): string {
  const lowerContent = content.toLowerCase();
  const lowerQuery = searchQuery.toLowerCase();
  const matchIndex = lowerContent.indexOf(lowerQuery);

  if (matchIndex === -1) return "";

  const start = Math.max(0, matchIndex - 40);
  const end = Math.min(content.length, matchIndex + searchQuery.length + 60);

  let excerpt = stripMarkdownSyntax(content.slice(start, end));
  if (!excerpt) return "";

  if (start > 0) excerpt = `...${excerpt}`;
  if (end < content.length) excerpt = `${excerpt}...`;

  return excerpt;
}

export interface SearchDocEntriesOptions {
  resolveTitle?: (entry: DocSearchEntry) => string;
  resolveSection?: (sectionId: string) => string;
}

/**
 * Pure search over indexed documents with weighted scoring (title > headings > body).
 */
export function searchDocEntries(
  entries: DocSearchEntry[],
  searchQuery: string,
  options: SearchDocEntriesOptions = {},
): DocSearchResult[] {
  const trimmed = searchQuery.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const results: DocSearchResult[] = [];

  for (const entry of entries) {
    const resolvedTitle = options.resolveTitle
      ? options.resolveTitle(entry)
      : entry.title;
    const resolvedSection = options.resolveSection
      ? options.resolveSection(entry.sectionId)
      : entry.sectionId;

    const titleMatches = countOccurrences(resolvedTitle, trimmed);
    const headingMatches = entry.headings.reduce(
      (sum, heading) => sum + countOccurrences(heading, trimmed),
      0,
    );
    const bodyMatches = countOccurrences(entry.content, trimmed);
    const totalMatches = titleMatches + headingMatches + bodyMatches;

    if (totalMatches === 0) continue;

    const score = titleMatches * 3 + headingMatches * 2 + bodyMatches;
    const excerpt =
      extractSearchExcerpt(entry.content, trimmed) ||
      entry.description ||
      entry.headings.find((h) =>
        h.toLowerCase().includes(trimmed.toLowerCase()),
      ) ||
      "";

    results.push({
      slug: entry.slug,
      title: resolvedTitle,
      section: resolvedSection,
      excerpt,
      matchCount: totalMatches,
      score,
    });
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.matchCount - a.matchCount;
  });

  return results;
}
