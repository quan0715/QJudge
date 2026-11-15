import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SkeletonText, IconButton } from "@carbon/react";
import { ArrowLeft } from "@carbon/icons-react";
import type { DocPageData, DocSiteConfig } from "@/core/docs";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import { useDocsFramework } from "../contexts/DocsFrameworkContext";
import DocSidebar from "../components/DocSidebar";
import DocTableOfContents from "../components/DocTableOfContents";
import DocFeedback from "../components/DocFeedback";
import QuickLinkCards from "../components/QuickLinkCards";
import styles from "./DocumentationScreen.module.scss";

const DocumentationScreen: React.FC = () => {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation("docs");
  const {
    routeBase,
    fallbackLanguage,
    source,
  } = useDocsFramework();

  const [config, setConfig] = useState<DocSiteConfig | null>(null);
  const [pageData, setPageData] = useState<DocPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    source
      .loadConfig()
      .then((data) => {
        if (!active) return;
        setConfig(data);

        if (!slug && data.defaultDoc) {
          navigate(`${routeBase}/${data.defaultDoc}`, { replace: true });
        }
      })
      .catch((err) => {
        console.error("Failed to load doc config:", err);
        if (active) setError(t("message.loadError"));
      });

    return () => {
      active = false;
    };
  }, [slug, navigate, routeBase, source, t]);

  useEffect(() => {
    if (!slug) return;

    let active = true;
    setLoading(true);
    setError(null);

    const effectiveFallback = config?.fallbackLanguage || fallbackLanguage;
    source
      .loadPage(slug, i18n.language, effectiveFallback)
      .then((data) => {
        if (!active) return;
        setPageData(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load document:", err);
        if (!active) return;
        setError(t("message.notFound"));
        setPageData(null);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    slug,
    i18n.language,
    config?.fallbackLanguage,
    fallbackLanguage,
    source,
    t,
  ]);

  const currentSlug = slug || config?.defaultDoc || "";

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const locale = i18n.language === "zh-TW" ? "zh-TW" : i18n.language;
    return date.toLocaleDateString(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  const currentTitle =
    pageData?.title ||
    (currentSlug ? t(`nav.items.${currentSlug}`, currentSlug) : "");
  const body = pageData?.body ?? "";
  const currentSection = config?.sections.find((section) =>
    section.items.includes(currentSlug),
  );
  const isDefaultDoc = currentSlug === (config?.defaultDoc || "overview");

  return (
    <div className={styles.container}>
      <aside className={styles.leftSidebar}>
        <div className={styles.sidebarContent}>
          {config ? (
            <DocSidebar config={config} currentSlug={currentSlug} />
          ) : (
            <div className={styles.sidebarSkeleton}>
              <SkeletonText paragraph lineCount={8} />
            </div>
          )}
        </div>
      </aside>

      <div className={styles.mainArea}>
        <header className={styles.pageHeader}>
          <div className={styles.pageNav}>
            <IconButton
              kind="ghost"
              size="sm"
              label={t("nav.back", "返回")}
              onClick={() => navigate(-1)}
            >
              <ArrowLeft />
            </IconButton>
            {currentSection && (
              <span className={styles.pageSection}>
                {currentSection.title ||
                  t(
                    currentSection.titleKey ||
                      `nav.sections.${currentSection.id}`,
                    currentSection.id,
                  )}
              </span>
            )}
          </div>

          {loading ? (
            <SkeletonText heading width="40%" />
          ) : (
            !error && (
              <>
                <h1 className={styles.pageTitle}>{currentTitle}</h1>
                {pageData?.lastUpdated && (
                  <p className={styles.pageMeta}>
                    {t("nav.lastUpdated", "前次更新")}{" "}
                    {formatDate(pageData.lastUpdated)}
                  </p>
                )}
              </>
            )
          )}
        </header>

        <div className={styles.contentArea}>
          <main className={styles.mainContent}>
            {loading ? (
              <SkeletonText paragraph lineCount={10} />
            ) : error ? (
              <div className={styles.errorState}>
                <p className={styles.errorText}>{error}</p>
              </div>
            ) : (
              <>
                {isDefaultDoc && <QuickLinkCards cards={config?.quickLinks} />}

                <MarkdownRenderer
                  enableMath
                  enableHighlight
                  enableCopy
                  enableMermaid
                  allowRawHtml
                >
                  {body}
                </MarkdownRenderer>

                <DocFeedback key={currentSlug} docSlug={currentSlug} />
              </>
            )}
          </main>

          <aside className={styles.rightSidebar}>
            {!loading && !error && pageData && (
              <DocTableOfContents items={pageData.toc} />
            )}
          </aside>
        </div>
      </div>
    </div>
  );
};

export default DocumentationScreen;
