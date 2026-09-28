import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SkeletonText, IconButton } from "@carbon/react";
import { ArrowLeft, Launch } from "@carbon/icons-react";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import DocSidebar from "../components/DocSidebar";
import DocTableOfContents from "../components/DocTableOfContents";
import DocFeedback from "../components/DocFeedback";
import QuickLinkCards from "../components/QuickLinkCards";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import { ThemeSwitch, LanguageSwitch, type ThemeValue } from "@/shared/ui/config";
import styles from "./DocumentationScreen.module.scss";


interface DocConfig {
  sections: Array<{
    id: string;
    items: string[];
  }>;
  defaultDoc: string;
}

const DocumentationScreen: React.FC = () => {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation("docs");
  const { preference, setPreference } = useTheme();

  const [config, setConfig] = useState<DocConfig | null>(null);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Load documentation config
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const basePath = import.meta.env.BASE_URL || "/";
        const res = await fetch(`${basePath}docs/config.json`);
        if (!res.ok) throw new Error("Failed to load config");
        const data = await res.json();
        setConfig(data);

        // If no slug provided, redirect to default doc
        if (!slug && data.defaultDoc) {
          navigate(`/docs/${data.defaultDoc}`, { replace: true });
        }
      } catch (err) {
        console.error("Failed to load doc config:", err);
        setError(t("message.loadError"));
      }
    };

    loadConfig();
  }, [slug, navigate, t]);

  // Load document content based on slug and language
  useEffect(() => {
    if (!slug) return;

    const loadDocument = async () => {
      setLoading(true);
      setError(null);

      const currentLang = i18n.language;
      const fallbackLang = "zh-TW";

      const basePath = import.meta.env.BASE_URL || "/";

      try {
        // Try current language first
        let res = await fetch(`${basePath}docs/${currentLang}/${slug}.md`);

        // Fallback to zh-TW if not found
        if (!res.ok && currentLang !== fallbackLang) {
          res = await fetch(`${basePath}docs/${fallbackLang}/${slug}.md`);
        }

        if (!res.ok) {
          throw new Error("Document not found");
        }

        const text = await res.text();
        setContent(text);

        // Get last modified date from response headers if available
        const lastModified = res.headers.get("Last-Modified");
        if (lastModified) {
          setLastUpdated(lastModified);
        } else {
          // Use a placeholder date for static files
          setLastUpdated(new Date().toISOString());
        }
      } catch (err) {
        console.error("Failed to load document:", err);
        setError(t("message.notFound"));
        setContent("");
      } finally {
        setLoading(false);
      }
    };

    loadDocument();
  }, [slug, i18n.language, t]);

  const currentSlug = slug || config?.defaultDoc || "";

  // Format the last updated date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const locale = i18n.language === "zh-TW" ? "zh-TW" : i18n.language;
    return date.toLocaleDateString(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  // A leading "# Title" in the Markdown is the article title; show it once, in the header.
  const leadingTitle = content.match(/^\s*#\s+(.+)\n*/);
  const currentTitle =
    leadingTitle?.[1].trim() || (currentSlug ? t(`nav.items.${currentSlug}`) : "");
  const body = leadingTitle ? content.slice(leadingTitle[0].length) : content;
  const currentSection = config?.sections.find((section) =>
    section.items.includes(currentSlug),
  );

  const handleThemeChange = (value: ThemeValue) => {
    setPreference(value);
  };

  const handleLanguageSelect = (langId: string) => {
    i18n.changeLanguage(langId);
  };

  return (
    <div className={styles.container}>
      {/* Left Sidebar - Navigation */}
      <aside className={styles.leftSidebar}>
        {/* Sidebar Navigation */}
        <div className={styles.sidebarContent}>
          {config ? (
            <DocSidebar config={config} currentSlug={currentSlug} />
          ) : (
            <div style={{ padding: "1rem" }}>
              <SkeletonText paragraph lineCount={8} />
            </div>
          )}
        </div>

        {/* Settings Section - Theme & Language */}
        <div className={styles.sidebarSettings}>
          <div className={styles.settingsDivider} />

          {/* Theme Section */}
          <div className={styles.settingsSection}>
            <ThemeSwitch
              value={preference}
              onChange={handleThemeChange}
            />
          </div>

          {/* Language Section */}
          <div className={styles.settingsSection}>
            <LanguageSwitch
              value={i18n.language}
              onChange={handleLanguageSelect}
            />
          </div>

          <div className={styles.settingsDivider} />

          {/* Dashboard Link */}
          <a
            href={import.meta.env.VITE_MAIN_APP_URL || "/"}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.dashboardLink}
          >
            <Launch size={16} />
            <span>QJudge</span>
          </a>
        </div>
      </aside>

      {/* Main Area (Header + Content + Right Menu) */}
      <div className={styles.mainArea}>
        {/* Header Title Area */}
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
                {t(`nav.sections.${currentSection.id}`)}
              </span>
            )}
          </div>

          {loading ? (
            <SkeletonText heading width="40%" />
          ) : (
            !error && (
              <>
                <h1 className={styles.pageTitle}>{currentTitle}</h1>
                {lastUpdated && (
                  <p className={styles.pageMeta}>
                    {t("nav.lastUpdated", "前次更新")} {formatDate(lastUpdated)}
                  </p>
                )}
              </>
            )
          )}
        </header>

        {/* Content + Right Menu Area */}
        <div className={styles.contentArea}>
          {/* Main Content */}
          <main className={styles.mainContent}>
            {loading ? (
              <SkeletonText paragraph lineCount={10} />
            ) : error ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "40vh",
                }}
              >
                <p className={styles.errorText}>
                  {error}
                </p>
              </div>
            ) : (
              <>
                {/* Show QuickLinkCards on overview page */}
                {currentSlug === "overview" && <QuickLinkCards />}

                <MarkdownRenderer
                  enableMath
                  enableHighlight
                  enableCopy
                  enableMermaid
                  allowRawHtml
                >
                  {body}
                </MarkdownRenderer>

                {/* Feedback section */}
                <DocFeedback docSlug={currentSlug} />
              </>
            )}
          </main>

          {/* Right Sidebar - Table of Contents */}
          <aside className={styles.rightSidebar}>
            {!loading && !error && content && (
              <DocTableOfContents content={content} />
            )}
          </aside>
        </div>
      </div>
    </div>
  );
};

export default DocumentationScreen;
