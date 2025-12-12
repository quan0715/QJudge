import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

interface SearchResult {
  slug: string;
  title: string;
  section: string;
  excerpt: string;
  matchCount: number;
}

interface DocIndex {
  slug: string;
  content: string;
}

interface DocConfig {
  sections: Array<{
    id: string;
    items: string[];
  }>;
}

export function useDocsSearch() {
  const { t, i18n } = useTranslation("docs");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [docIndex, setDocIndex] = useState<DocIndex[]>([]);
  const [config, setConfig] = useState<DocConfig | null>(null);

  // Load config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch("/docs/config.json");
        if (res.ok) {
          const data = await res.json();
          setConfig(data);
        }
      } catch (err) {
        console.error("Failed to load doc config:", err);
      }
    };
    loadConfig();
  }, []);

  // Build search index when config or language changes
  useEffect(() => {
    if (!config) return;

    const buildIndex = async () => {
      const currentLang = i18n.language;
      const fallbackLang = "zh-TW";
      const allSlugs = config.sections.flatMap((section) => section.items);

      const indexPromises = allSlugs.map(async (slug) => {
        try {
          let res = await fetch(`/docs/${currentLang}/${slug}.md`);
          if (!res.ok && currentLang !== fallbackLang) {
            res = await fetch(`/docs/${fallbackLang}/${slug}.md`);
          }
          if (res.ok) {
            const content = await res.text();
            return { slug, content };
          }
        } catch {
          // Ignore errors
        }
        return null;
      });

      const results = await Promise.all(indexPromises);
      setDocIndex(results.filter((r): r is DocIndex => r !== null));
    };

    buildIndex();
  }, [config, i18n.language]);

  // Find which section a slug belongs to
  const getSectionForSlug = useCallback(
    (slug: string): string => {
      if (!config) return "";
      const section = config.sections.find((s) => s.items.includes(slug));
      return section ? t(`nav.sections.${section.id}`) : "";
    },
    [config, t]
  );

  // Extract excerpt around the match
  const getExcerpt = useCallback(
    (content: string, searchQuery: string): string => {
      const lowerContent = content.toLowerCase();
      const lowerQuery = searchQuery.toLowerCase();
      const matchIndex = lowerContent.indexOf(lowerQuery);

      if (matchIndex === -1) return "";

      const start = Math.max(0, matchIndex - 40);
      const end = Math.min(
        content.length,
        matchIndex + searchQuery.length + 60
      );

      let excerpt = content.slice(start, end);

      // Clean up markdown syntax
      excerpt = excerpt
        .replace(/#{1,6}\s/g, "")
        .replace(/\*\*/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\|/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (start > 0) excerpt = "..." + excerpt;
      if (end < content.length) excerpt = excerpt + "...";

      return excerpt;
    },
    []
  );

  // Count matches in content
  const countMatches = useCallback(
    (content: string, searchQuery: string): number => {
      const lowerContent = content.toLowerCase();
      const lowerQuery = searchQuery.toLowerCase();
      let count = 0;
      let pos = 0;

      while ((pos = lowerContent.indexOf(lowerQuery, pos)) !== -1) {
        count++;
        pos += lowerQuery.length;
      }

      return count;
    },
    []
  );

  // Perform search
  const search = useMemo(() => {
    return (searchQuery: string) => {
      if (!searchQuery.trim() || searchQuery.length < 2) {
        setResults([]);
        return;
      }

      setIsSearching(true);

      const searchResults: SearchResult[] = [];

      for (const doc of docIndex) {
        const lowerContent = doc.content.toLowerCase();
        const lowerQuery = searchQuery.toLowerCase();

        if (lowerContent.includes(lowerQuery)) {
          searchResults.push({
            slug: doc.slug,
            title: t(`nav.items.${doc.slug}`),
            section: getSectionForSlug(doc.slug),
            excerpt: getExcerpt(doc.content, searchQuery),
            matchCount: countMatches(doc.content, searchQuery),
          });
        }
      }

      // Sort by match count (descending)
      searchResults.sort((a, b) => b.matchCount - a.matchCount);

      setResults(searchResults);
      setIsSearching(false);
    };
  }, [docIndex, t, getSectionForSlug, getExcerpt, countMatches]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      search(query);
    }, 200);

    return () => clearTimeout(timer);
  }, [query, search]);

  return {
    query,
    setQuery,
    results,
    isSearching,
    hasResults: results.length > 0,
    isIndexReady: docIndex.length > 0,
  };
}
