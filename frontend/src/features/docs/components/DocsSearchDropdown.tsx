import { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ExpandableSearch, Layer } from "@carbon/react";
import { Document, ArrowRight } from "@carbon/icons-react";
import { useDocsSearch } from "../hooks/useDocsSearch";

const DocsSearchDropdown: React.FC = () => {
  const { t } = useTranslation("docs");
  const navigate = useNavigate();
  const { query, setQuery, results, isSearching, hasResults, isIndexReady } =
    useDocsSearch();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
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

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      setQuery("");
      setIsExpanded(false);
    }
  };

  const handleResultClick = (slug: string) => {
    navigate(`/docs/${slug}`);
    setIsOpen(false);
    setQuery("");
    setIsExpanded(false);
  };

  const highlightMatch = (text: string, searchQuery: string) => {
    if (!searchQuery) return text;

    const regex = new RegExp(`(${searchQuery})`, "gi");
    const parts = text.split(regex);

    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark
          key={i}
          style={{
            backgroundColor: "var(--cds-highlight)",
            padding: "0 2px",
            borderRadius: "2px",
          }}
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div
      ref={containerRef}
      style={{ position: "relative" }}
      onKeyDown={handleKeyDown}
    >
      <ExpandableSearch
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
          // Delay to allow click on results
          setTimeout(() => {
            if (!query) {
              setIsExpanded(false);
            }
          }, 200);
        }}
        closeButtonLabelText="Clear"
        disabled={!isIndexReady}
      />

      {/* Search Results Dropdown */}
      {isOpen && isExpanded && query.length >= 2 && (
        <Layer>
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              width: "360px",
              marginTop: "4px",
              backgroundColor: "var(--cds-layer-01)",
              border: "1px solid var(--cds-border-subtle-01)",
              borderRadius: "4px",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
              maxHeight: "400px",
              overflowY: "auto",
              zIndex: 9999,
            }}
          >
            {isSearching ? (
              <div
                style={{
                  padding: "1rem",
                  textAlign: "center",
                  color: "var(--cds-text-secondary)",
                }}
              >
                {t("search.searching", "搜尋中...")}
              </div>
            ) : hasResults ? (
              <>
                <div
                  style={{
                    padding: "0.5rem 1rem",
                    fontSize: "0.75rem",
                    color: "var(--cds-text-secondary)",
                    borderBottom: "1px solid var(--cds-border-subtle-01)",
                  }}
                >
                  {t("search.resultsCount", {
                    count: results.length,
                    defaultValue: `找到 ${results.length} 個結果`,
                  })}
                </div>
                {results.map((result) => (
                  <button
                    key={result.slug}
                    onClick={() => handleResultClick(result.slug)}
                    style={{
                      width: "100%",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                      padding: "0.75rem 1rem",
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--cds-border-subtle-01)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background-color 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        "var(--cds-layer-hover-01)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    {/* Title Row */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <Document size={16} />
                      <span
                        style={{
                          fontWeight: 600,
                          color: "var(--cds-text-primary)",
                          flex: 1,
                        }}
                      >
                        {result.title}
                      </span>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--cds-text-secondary)",
                        }}
                      >
                        {result.matchCount}{" "}
                        {t("search.matches", { defaultValue: "處符合" })}
                      </span>
                    </div>

                    {/* Section */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        fontSize: "0.75rem",
                        color: "var(--cds-text-secondary)",
                        paddingLeft: "1.5rem",
                      }}
                    >
                      <ArrowRight size={12} />
                      {result.section}
                    </div>

                    {/* Excerpt */}
                    {result.excerpt && (
                      <div
                        style={{
                          fontSize: "0.8125rem",
                          color: "var(--cds-text-secondary)",
                          paddingLeft: "1.5rem",
                          lineHeight: 1.4,
                        }}
                      >
                        {highlightMatch(result.excerpt, query)}
                      </div>
                    )}
                  </button>
                ))}
              </>
            ) : (
              <div
                style={{
                  padding: "1.5rem 1rem",
                  textAlign: "center",
                  color: "var(--cds-text-secondary)",
                }}
              >
                {t("search.noResults", "找不到符合的內容")}
              </div>
            )}
          </div>
        </Layer>
      )}
    </div>
  );
};

export default DocsSearchDropdown;
