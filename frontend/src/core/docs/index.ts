export type {
  DocContentSourcePort,
  DocFrontmatter,
  DocPageData,
  DocParsedMarkdown,
  DocQuickLinkCardConfig,
  DocSearchEntry,
  DocSearchResult,
  DocSectionConfig,
  DocSiteConfig,
  DocTagType,
  DocTocItem,
} from "./docs.types";

export {
  extractLeadingTitle,
  parseDocFrontmatter,
  parseDocMarkdown,
} from "./frontmatter.utils";

export {
  extractDocToc,
  slugifyHeading,
  stripFencedCodeBlocks,
} from "./toc.utils";

export {
  countOccurrences,
  extractSearchExcerpt,
  searchDocEntries,
  stripMarkdownSyntax,
  type SearchDocEntriesOptions,
} from "./search.usecase";
