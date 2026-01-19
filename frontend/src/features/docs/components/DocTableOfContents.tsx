import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Layer } from "@carbon/react";
import { ArrowRight } from "@carbon/icons-react";
import GithubSlugger from "github-slugger";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface DocTableOfContentsProps {
  content: string;
}

const DocTableOfContents: React.FC<DocTableOfContentsProps> = ({ content }) => {
  const { t } = useTranslation("docs");
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  // Extract headings from markdown content
  useEffect(() => {
    const slugger = new GithubSlugger();
    const headingRegex = /^(#{2,3})\s+(.+)$/gm;
    const extractedHeadings: TocItem[] = [];
    let match;

    while ((match = headingRegex.exec(content)) !== null) {
      const level = match[1].length;
      const text = match[2].trim();
      // Use github-slugger for consistent ID generation with rehype-slug
      const id = slugger.slug(text);

      extractedHeadings.push({ id, text, level });
    }

    setHeadings(extractedHeadings);
  }, [content]);

  // Track active heading on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-100px 0px -80% 0px" }
    );

    // Observe all heading elements
    headings.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, [headings]);

  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 100;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  if (headings.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: "sticky",
        top: "5rem",
        maxHeight: "calc(100vh - 6rem)",
        overflowY: "auto",
      }}
    >
      <Layer>
        <nav>
          {/* Title */}
          <p
            className="cds--label"
            style={{
              padding: "0.75rem 1rem",
              margin: 0,
              fontWeight: 600,
              borderBottom: "1px solid var(--cds-border-subtle-01)",
            }}
          >
            {t("nav.onThisPage", "在此頁面")}
          </p>

          {/* TOC Items */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
            }}
          >
            {headings.map((heading) => {
              const isActive = activeId === heading.id;
              const isH3 = heading.level === 3;

              return (
                <div
                  key={heading.id}
                  onClick={() => scrollToHeading(heading.id)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.5rem",
                    padding: "0.75rem 1rem",
                    paddingLeft: isH3 ? "1.5rem" : "1rem",
                    fontSize: "0.875rem",
                    lineHeight: 1.4,
                    color: isActive
                      ? "var(--cds-text-primary)"
                      : "var(--cds-text-secondary)",
                    backgroundColor: isActive
                      ? "var(--cds-layer-selected-01)"
                      : "transparent",
                    borderBottom: "1px solid var(--cds-border-subtle-01)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    wordBreak: "break-word",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor =
                        "var(--cds-layer-hover-01)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }
                  }}
                >
                  {isH3 && (
                    <ArrowRight
                      size={14}
                      style={{
                        flexShrink: 0,
                        marginTop: "2px",
                        color: "var(--cds-text-secondary)",
                      }}
                    />
                  )}
                  <span>{heading.text}</span>
                </div>
              );
            })}
          </div>
        </nav>
      </Layer>
    </div>
  );
};

export default DocTableOfContents;
