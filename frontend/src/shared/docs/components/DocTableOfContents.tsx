import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button, Layer } from "@carbon/react";
import { ArrowRight } from "@carbon/icons-react";
import { extractDocToc, type DocTocItem } from "@/core/docs";
import styles from "./DocTableOfContents.module.scss";

export interface DocTableOfContentsProps {
  content?: string;
  items?: DocTocItem[];
}

const DocTableOfContents: React.FC<DocTableOfContentsProps> = ({
  content = "",
  items,
}) => {
  const { t } = useTranslation("docs");
  const [activeId, setActiveId] = useState<string>("");

  const headings = useMemo(
    () => items ?? extractDocToc(content),
    [content, items],
  );

  // Track active heading on scroll
  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-100px 0px -80% 0px" },
    );

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
    <div className={styles.root}>
      <Layer>
        <nav className={styles.tocNav} aria-label={t("nav.onThisPage", "在此頁面")}>
          <p className={styles.heading}>{t("nav.onThisPage", "在此頁面")}</p>

          <div className={styles.tocList}>
            {headings.map((heading) => {
              const isActive = activeId === heading.id;
              const isH3 = heading.level === 3;
              const itemClasses = [
                styles.tocItem,
                isH3 ? styles.tocItemNested : "",
                isActive ? styles.tocItemActive : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <Button
                  type="button"
                  kind="ghost"
                  size="sm"
                  key={heading.id}
                  className={itemClasses}
                  aria-current={isActive ? "location" : undefined}
                  onClick={() => scrollToHeading(heading.id)}
                >
                  {isH3 && (
                    <ArrowRight size={14} className={styles.nestedIcon} />
                  )}
                  <span>{heading.text}</span>
                </Button>
              );
            })}
          </div>
        </nav>
      </Layer>
    </div>
  );
};

export default DocTableOfContents;
