export type DocTagType =
  | "blue"
  | "green"
  | "purple"
  | "cyan"
  | "magenta"
  | "gray";

export interface DocFrontmatter {
  title?: string;
  description?: string;
  icon?: string;
  lastUpdated?: string;
}

export interface DocSectionConfig {
  id: string;
  icon?: string;
  titleKey?: string;
  title?: string;
  items: string[];
}

export interface DocQuickLinkCardConfig {
  id: string;
  icon?: string;
  tagType?: DocTagType;
  tagKey?: string;
  titleKey?: string;
  descriptionKey?: string;
  links: string[];
}

export interface DocSiteConfig {
  sections: DocSectionConfig[];
  defaultDoc: string;
  quickLinks?: DocQuickLinkCardConfig[];
  fallbackLanguage?: string;
}

export interface DocTocItem {
  id: string;
  text: string;
  level: number;
}

export interface DocParsedMarkdown {
  frontmatter: DocFrontmatter;
  title: string | null;
  body: string;
  toc: DocTocItem[];
}

export interface DocPageData {
  slug: string;
  lang: string;
  title: string | null;
  description?: string;
  body: string;
  rawContent: string;
  sectionId?: string;
  lastUpdated?: string | null;
  toc: DocTocItem[];
}

export interface DocSearchEntry {
  slug: string;
  lang: string;
  sectionId: string;
  title: string;
  description?: string;
  content: string;
  headings: string[];
}

export interface DocSearchResult {
  slug: string;
  title: string;
  section: string;
  excerpt: string;
  matchCount: number;
  score: number;
}

export interface DocContentSourcePort {
  loadConfig(): Promise<DocSiteConfig>;
  loadPage(
    slug: string,
    lang: string,
    fallbackLang?: string,
  ): Promise<DocPageData>;
  loadSearchIndex(
    lang: string,
    config: DocSiteConfig,
    fallbackLang?: string,
  ): Promise<DocSearchEntry[]>;
}
