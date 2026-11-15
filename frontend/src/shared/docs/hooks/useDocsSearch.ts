import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  searchDocEntries,
  type DocSearchEntry,
  type DocSearchResult,
  type DocSiteConfig,
} from "@/core/docs";
import { useDocsFramework } from "../contexts/DocsFrameworkContext";

export function useDocsSearch() {
  const { t, i18n } = useTranslation("docs");
  const { source, fallbackLanguage } = useDocsFramework();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DocSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [docIndex, setDocIndex] = useState<DocSearchEntry[]>([]);
  const [config, setConfig] = useState<DocSiteConfig | null>(null);

  useEffect(() => {
    let active = true;
    source
      .loadConfig()
      .then((data) => {
        if (active) setConfig(data);
      })
      .catch((err) => {
        console.error("Failed to load doc config:", err);
      });
    return () => {
      active = false;
    };
  }, [source]);

  useEffect(() => {
    if (!config) return;
    let active = true;

    source
      .loadSearchIndex(
        i18n.language,
        config,
        config.fallbackLanguage || fallbackLanguage,
      )
      .then((entries) => {
        if (active) setDocIndex(entries);
      })
      .catch((err) => {
        console.error("Failed to build docs search index:", err);
      });

    return () => {
      active = false;
    };
  }, [config, fallbackLanguage, i18n.language, source]);

  const resolveTitle = useCallback(
    (entry: DocSearchEntry) => {
      const translated = t(`nav.items.${entry.slug}`, { defaultValue: "" });
      return translated || entry.title || entry.slug;
    },
    [t],
  );

  const resolveSection = useCallback(
    (sectionId: string) => {
      if (!sectionId) return "";
      const configuredSection = config?.sections.find(
        (section) => section.id === sectionId,
      );
      if (configuredSection?.title) return configuredSection.title;
      return t(configuredSection?.titleKey || `nav.sections.${sectionId}`, {
        defaultValue: sectionId,
      });
    },
    [config, t],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!query.trim() || query.trim().length < 2) {
        setResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      const nextResults = searchDocEntries(docIndex, query, {
        resolveTitle,
        resolveSection,
      });
      setResults(nextResults);
      setIsSearching(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [docIndex, query, resolveSection, resolveTitle]);

  return {
    query,
    setQuery,
    results,
    isSearching,
    hasResults: results.length > 0,
    isIndexReady: docIndex.length > 0,
  };
}
