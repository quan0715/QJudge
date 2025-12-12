import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Search, Layer } from "@carbon/react";
import {
  Rocket,
  Book,
  DocumentBlank,
  Education,
  UserAdmin,
  Code,
  ChevronDown,
  ChevronRight,
} from "@carbon/icons-react";

interface DocConfig {
  sections: Array<{
    id: string;
    items: string[];
  }>;
  defaultDoc: string;
}

interface DocSidebarProps {
  config: DocConfig;
  currentSlug: string;
}

// Section icons mapping
const sectionIcons: Record<string, React.ElementType> = {
  "getting-started": Rocket,
  "user-guide": Book,
  reference: DocumentBlank,
  "teacher-guide": Education,
  "admin-guide": UserAdmin,
  "developer-guide": Code,
};

const DocSidebar: React.FC<DocSidebarProps> = ({ config, currentSlug }) => {
  const { t } = useTranslation("docs");
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set()
  );

  // Auto-expand section containing current slug
  useEffect(() => {
    const currentSection = config.sections.find((section) =>
      section.items.includes(currentSlug)
    );
    if (currentSection) {
      setExpandedSections((prev) => new Set([...prev, currentSection.id]));
    }
  }, [currentSlug, config.sections]);

  const handleNavigation = (slug: string) => {
    navigate(`/docs/${slug}`, { replace: false });
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  // Filter items based on search query
  const filteredSections = config.sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const itemTitle = t(`nav.items.${item}`).toLowerCase();
        const sectionTitle = t(`nav.sections.${section.id}`).toLowerCase();
        const query = searchQuery.toLowerCase();
        return itemTitle.includes(query) || sectionTitle.includes(query);
      }),
    }))
    .filter((section) => section.items.length > 0);

  // Expand all sections when searching
  useEffect(() => {
    if (searchQuery) {
      setExpandedSections(
        new Set(filteredSections.map((section) => section.id))
      );
    }
  }, [searchQuery, filteredSections.length]);

  return (
    <Layer>
      <nav
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Search Box */}
        <div style={{ padding: "0 1rem 1rem 1rem" }}>
          <Search
            size="sm"
            placeholder={t("nav.searchPlaceholder", "搜尋文檔...")}
            labelText=""
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            closeButtonLabelText="Clear"
          />
        </div>

        {/* Navigation Sections - IBM Style */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
          }}
        >
          {filteredSections.map((section) => {
            const Icon = sectionIcons[section.id] || DocumentBlank;
            const isExpanded = expandedSections.has(section.id);
            const hasActiveItem = section.items.includes(currentSlug);

            return (
              <div key={section.id} style={{ marginBottom: "0.25rem" }}>
                {/* Section Header */}
                <button
                  onClick={() => toggleSection(section.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.75rem 1rem",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: hasActiveItem
                      ? "var(--cds-text-primary)"
                      : "var(--cds-text-secondary)",
                    fontSize: "0.875rem",
                    fontWeight: 600,
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
                  <Icon size={16} />
                  <span style={{ flex: 1 }}>
                    {t(`nav.sections.${section.id}`)}
                  </span>
                  {isExpanded ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </button>

                {/* Section Items */}
                {isExpanded && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    {section.items.map((item) => {
                      const isActive = currentSlug === item;

                      return (
                        <button
                          key={item}
                          onClick={() => handleNavigation(item)}
                          style={{
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            padding: "0.625rem 1rem 0.625rem 2.5rem",
                            background: isActive
                              ? "var(--cds-layer-selected-01, #e0e0e0)"
                              : "transparent",
                            border: "none",
                            borderLeft: isActive
                              ? "3px solid var(--cds-border-interactive, #0f62fe)"
                              : "3px solid transparent",
                            cursor: "pointer",
                            color: isActive
                              ? "var(--cds-text-primary)"
                              : "var(--cds-text-secondary)",
                            fontSize: "0.875rem",
                            fontWeight: isActive ? 600 : 400,
                            textAlign: "left",
                            transition: "all 0.15s ease",
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.backgroundColor =
                                "var(--cds-layer-hover-01)";
                              e.currentTarget.style.color =
                                "var(--cds-text-primary)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.backgroundColor =
                                "transparent";
                              e.currentTarget.style.color =
                                "var(--cds-text-secondary)";
                            }
                          }}
                        >
                          {t(`nav.items.${item}`)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>
    </Layer>
  );
};

export default DocSidebar;
