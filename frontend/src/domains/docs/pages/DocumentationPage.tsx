import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SkeletonText, IconButton } from "@carbon/react";
import {
  ArrowLeft,
  Light,
  Asleep,
  Laptop,
  Launch,
  Language,
} from "@carbon/icons-react";
import MarkdownRenderer from "@/ui/components/common/MarkdownRenderer";
import DocSidebar from "../components/DocSidebar";
import DocTableOfContents from "../components/DocTableOfContents";
import DocFeedback from "../components/DocFeedback";
import QuickLinkCards from "../components/QuickLinkCards";
import AIGeneratedBadge from "../components/AIGeneratedBadge";
import { useTheme } from "@/ui/theme/ThemeContext";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import styles from "./DocumentationPage.module.scss";

interface DocConfig {
  sections: Array<{
    id: string;
    items: string[];
  }>;
  defaultDoc: string;
}

type ThemeValue = "light" | "dark" | "system";

const DocumentationPage: React.FC = () => {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation("docs");
  const { t: tCommon } = useTranslation();
  const { setTheme } = useTheme();

  const [config, setConfig] = useState<DocConfig | null>(null);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [currentTheme, setCurrentTheme] = useState<ThemeValue>(() => {
    const stored = localStorage.getItem("theme-preference");
    return (stored as ThemeValue) || "system";
  });

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

  // Get current document title
  const currentTitle = currentSlug ? t(`nav.items.${currentSlug}`) : "";

  // Theme handling
  const handleThemeChange = (value: ThemeValue) => {
    setCurrentTheme(value);
    localStorage.setItem("theme-preference", value);

    if (value === "system") {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      setTheme(prefersDark ? "g100" : "white");
    } else if (value === "dark") {
      setTheme("g100");
    } else {
      setTheme("white");
    }
  };

  const handleLanguageSelect = (langId: string) => {
    i18n.changeLanguage(langId);
  };

  const themeOptions = [
    {
      value: "light" as ThemeValue,
      label: tCommon("theme.light"),
      icon: <Light size={16} />,
    },
    {
      value: "dark" as ThemeValue,
      label: tCommon("theme.dark"),
      icon: <Asleep size={16} />,
    },
    {
      value: "system" as ThemeValue,
      label: tCommon("theme.system"),
      icon: <Laptop size={16} />,
    },
  ];

  return (
    <div className={styles.container}>
      {/* Left Sidebar - Navigation */}
      <aside className={styles.leftSidebar}>
        {/* Product Title */}
        <div className={styles.sidebarHeader}>
          <p className="cds--label" style={{ marginBottom: "0.25rem" }}>
            {t("nav.productLabel", "使用說明")}
          </p>
          <h2 className="cds--type-productive-heading-03" style={{ margin: 0 }}>
            QJudge
          </h2>
        </div>

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
            <div className={styles.settingsLabel}>
              <Light size={16} />
              <span>{tCommon("preferences.themeSection")}</span>
            </div>
            <div className={styles.themeButtons}>
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleThemeChange(option.value)}
                  className={`${styles.themeBtn} ${
                    currentTheme === option.value ? styles.active : ""
                  }`}
                  title={option.label}
                >
                  {option.icon}
                </button>
              ))}
            </div>
          </div>

          {/* Language Section */}
          <div className={styles.settingsSection}>
            <div className={styles.settingsLabel}>
              <Language size={16} />
              <span>{tCommon("preferences.languageSection")}</span>
            </div>
            <div className={styles.languageButtons}>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => handleLanguageSelect(lang.id)}
                  className={`${styles.langBtn} ${
                    i18n.language === lang.id ? styles.active : ""
                  }`}
                  title={lang.label}
                >
                  {lang.shortLabel}
                </button>
              ))}
            </div>
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
          {/* Back Button */}
          <IconButton
            kind="ghost"
            size="sm"
            label={t("nav.back", "返回")}
            onClick={() => navigate(-1)}
            style={{ marginBottom: "1rem", marginLeft: "-0.5rem" }}
          >
            <ArrowLeft />
          </IconButton>

          {/* Page Title */}
          {!loading && !error && (
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  marginBottom: "0.5rem",
                }}
              >
                <h1
                  className="cds--type-productive-heading-05"
                  style={{ margin: 0 }}
                >
                  {currentTitle}
                </h1>
                <AIGeneratedBadge />
              </div>
              {lastUpdated && (
                <p className="cds--label" style={{ margin: 0 }}>
                  {t("nav.lastUpdated", "前次更新")} {formatDate(lastUpdated)}
                </p>
              )}
            </div>
          )}

          {loading && (
            <div>
              <SkeletonText heading width="40%" />
            </div>
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
                <p
                  className="cds--type-body-long-02"
                  style={{ color: "var(--cds-text-secondary)" }}
                >
                  {error}
                </p>
              </div>
            ) : (
              <>
                {/* Show QuickLinkCards on overview page */}
                {currentSlug === "overview" && <QuickLinkCards />}

                <MarkdownRenderer enableMath enableHighlight enableCopy>
                  {content}
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

export default DocumentationPage;
