import { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ClickableTile, ExpandableSearch, Layer } from "@carbon/react";
import { Document, ArrowRight } from "@carbon/icons-react";
import { useDocsFramework } from "../contexts/DocsFrameworkContext";
import { useDocsSearch } from "../hooks/useDocsSearch";
import styles from "./DocsSearchDropdown.module.scss";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const DocsSearchDropdown: React.FC = () => {
  const { t } = useTranslation("docs");
  const navigate = useNavigate();
  const { routeBase } = useDocsFramework();
  const { query, setQuery, results, isSearching, hasResults, isIndexReady } =
    useDocsSearch();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      setQuery("");
      setIsExpanded(false);
    }
  };

  const handleResultClick = (slug: string) => {
    navigate(`${routeBase}/${slug}`);
    setIsOpen(false);
    setQuery("");
    setIsExpanded(false);
  };

  const highlightMatch = (text: string, searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return text;

    const regex = new RegExp(`(${escapeRegExp(trimmed)})`, "gi");
    const parts = text.split(regex);
    const lowerQuery = trimmed.toLowerCase();

    return parts.map((part, i) =>
      part.toLowerCase() === lowerQuery ? (
        <mark key={i} className={styles.highlight}>
          {part}
        </mark>
      ) : (
        part
      ),
    );
  };

  return (
    <div
      ref={containerRef}
      className={styles.root}
      onKeyDown={handleKeyDown}
    >
      <ExpandableSearch
        className={styles.searchInput}
        size="lg"
        placeholder={t("search.placeholder", "搜尋文檔內容...")}
        labelText={t("search.label", "搜尋文檔")}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (e.target.value.length >= 2) {
            setIsOpen(true);
          }
        }}
        onFocus={() => {
          if (query.length >= 2) {
            setIsOpen(true);
          }
        }}
        onExpand={() => setIsExpanded(true)}
        onBlur={() => {
          setTimeout(() => {
            if (!query) {
              setIsExpanded(false);
            }
          }, 200);
        }}
        closeButtonLabelText="Clear"
        disabled={!isIndexReady}
      />

      {isOpen && isExpanded && query.length >= 2 && (
        <Layer withBackground className={styles.dropdownPanel}>
          {isSearching ? (
            <div className={styles.statusEmpty}>
              {t("search.searching", "搜尋中...")}
            </div>
          ) : hasResults ? (
            <>
              <div className={styles.resultsHeader}>
                {t("search.resultsCount", {
                  count: results.length,
                  defaultValue: `找到 ${results.length} 個結果`,
                })}
              </div>
              {results.map((result) => (
                <ClickableTile
                  key={result.slug}
                  href={`#${routeBase}/${result.slug}`}
                  className={styles.resultTile}
                  onClick={(event) => {
                    event.preventDefault();
                    handleResultClick(result.slug);
                  }}
                >
                  <div className={styles.resultTitleRow}>
                    <Document size={16} />
                    <span className={styles.resultTitle}>{result.title}</span>
                    <span className={styles.resultMatches}>
                      {result.matchCount}{" "}
                      {t("search.matches", { defaultValue: "處符合" })}
                    </span>
                  </div>

                  <div className={styles.resultSection}>
                    <ArrowRight size={12} />
                    {result.section}
                  </div>

                  {result.excerpt && (
                    <div className={styles.resultExcerpt}>
                      {highlightMatch(result.excerpt, query)}
                    </div>
                  )}
                </ClickableTile>
              ))}
            </>
          ) : (
            <div className={styles.statusEmpty}>
              {t("search.noResults", "找不到符合的內容")}
            </div>
          )}
        </Layer>
      )}
    </div>
  );
};

export default DocsSearchDropdown;
