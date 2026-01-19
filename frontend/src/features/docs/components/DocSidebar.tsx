import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Layer } from "@carbon/react";
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
  /** Callback when a link is clicked (for closing mobile menu) */
  onLinkClick?: () => void;
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

const DocSidebar: React.FC<DocSidebarProps> = ({
  config,
  currentSlug,
  onLinkClick,
}) => {
  const { t } = useTranslation("docs");
  const navigate = useNavigate();
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
    // Close mobile menu after navigation
    onLinkClick?.();
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
        {/* Navigation Sections */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
          }}
        >
          {config.sections.map((section) => {
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
