import { useState, useEffect } from "react";
import {
  Header,
  HeaderContainer,
  HeaderName,
  HeaderMenuButton,
  SideNav,
  SideNavItems,
  SideNavDivider,
  SkeletonText,
} from "@carbon/react";
import { Light, Asleep, Laptop, Launch, Language } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import { useTheme } from "@/ui/theme/ThemeContext";
import DocsSearchDropdown from "./DocsSearchDropdown";
import DocSidebar from "./DocSidebar";
import styles from "./DocsHeader.module.scss";

interface DocConfig {
  sections: Array<{
    id: string;
    items: string[];
  }>;
  defaultDoc: string;
}

type ThemeValue = "light" | "dark" | "system";

const DocsHeader: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { t: tDocs } = useTranslation("docs");
  const { setTheme } = useTheme();
  const location = useLocation();
  const [isSideNavExpanded, setIsSideNavExpanded] = useState(false);
  const [docsConfig, setDocsConfig] = useState<DocConfig | null>(null);
  const [currentTheme, setCurrentTheme] = useState<ThemeValue>(() => {
    const stored = localStorage.getItem("theme-preference");
    return (stored as ThemeValue) || "system";
  });

  // Get current doc slug from URL
  const currentDocSlug =
    location.pathname.replace("/docs/", "").replace("/docs", "") ||
    docsConfig?.defaultDoc ||
    "";

  // Load docs config
  useEffect(() => {
    const loadDocsConfig = async () => {
      try {
        const basePath = import.meta.env.BASE_URL || "/";
        const res = await fetch(`${basePath}docs/config.json`);
        if (res.ok) {
          const data = await res.json();
          setDocsConfig(data);
        }
      } catch (err) {
        console.error("Failed to load docs config:", err);
      }
    };
    loadDocsConfig();
  }, []);

  const handleLanguageSelect = (langId: string) => {
    i18n.changeLanguage(langId);
  };

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

  const themeOptions = [
    {
      value: "light" as ThemeValue,
      label: t("theme.light"),
      icon: <Light size={16} />,
    },
    {
      value: "dark" as ThemeValue,
      label: t("theme.dark"),
      icon: <Asleep size={16} />,
    },
    {
      value: "system" as ThemeValue,
      label: t("theme.system"),
      icon: <Laptop size={16} />,
    },
  ];

  return (
    <HeaderContainer
      render={() => (
        <Header aria-label="QJudge Documentation">
          <HeaderMenuButton
            aria-label={t("header.menu", "選單")}
            onClick={() => setIsSideNavExpanded(!isSideNavExpanded)}
            isActive={isSideNavExpanded}
          />
          <HeaderName
            href={import.meta.env.VITE_MAIN_APP_URL || "/"}
            prefix="QJudge"
          >
            DOCS
          </HeaderName>

          {/* Search - Only element in header */}
          <div className={styles.searchWrapper}>
            <DocsSearchDropdown />
          </div>

          {/* Side Navigation - Same content for mobile and desktop */}
          <SideNav
            aria-label={tDocs("nav.productLabel", "使用說明")}
            expanded={isSideNavExpanded}
            isPersistent={false}
            onSideNavBlur={() => setIsSideNavExpanded(false)}
          >
            <SideNavItems>
              {/* Sidebar Header */}
              <div
                style={{
                  padding: "1rem",
                  borderBottom: "1px solid var(--cds-border-subtle-01)",
                }}
              >
                <p className="cds--label" style={{ marginBottom: "0.25rem" }}>
                  {tDocs("nav.productLabel", "使用說明")}
                </p>
                <h2
                  className="cds--type-productive-heading-03"
                  style={{ margin: 0 }}
                >
                  QJudge
                </h2>
              </div>

              {/* DocSidebar Navigation */}
              <div style={{ flex: 1, overflowY: "auto" }}>
                {docsConfig ? (
                  <DocSidebar
                    config={docsConfig}
                    currentSlug={currentDocSlug}
                  />
                ) : (
                  <div style={{ padding: "1rem" }}>
                    <SkeletonText paragraph lineCount={8} />
                  </div>
                )}
              </div>

              <SideNavDivider />

              {/* Theme Section */}
              <div style={{ padding: "0.75rem 1rem" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginBottom: "0.5rem",
                    color: "var(--cds-text-secondary)",
                    fontSize: "0.75rem",
                  }}
                >
                  <Light size={16} />
                  <span>{t("preferences.themeSection")}</span>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {themeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleThemeChange(option.value)}
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.25rem",
                        padding: "0.5rem",
                        background:
                          currentTheme === option.value
                            ? "var(--cds-layer-selected-01)"
                            : "transparent",
                        border: `1px solid ${
                          currentTheme === option.value
                            ? "var(--cds-border-interactive)"
                            : "var(--cds-border-subtle)"
                        }`,
                        borderRadius: "4px",
                        cursor: "pointer",
                        color:
                          currentTheme === option.value
                            ? "var(--cds-text-primary)"
                            : "var(--cds-text-secondary)",
                        fontSize: "0.75rem",
                        transition: "all 0.15s ease",
                      }}
                      title={option.label}
                    >
                      {option.icon}
                    </button>
                  ))}
                </div>
              </div>

              {/* Language Section */}
              <div style={{ padding: "0.75rem 1rem" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginBottom: "0.5rem",
                    color: "var(--cds-text-secondary)",
                    fontSize: "0.75rem",
                  }}
                >
                  <Language size={16} />
                  <span>{t("preferences.languageSection")}</span>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <button
                      key={lang.id}
                      type="button"
                      onClick={() => handleLanguageSelect(lang.id)}
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0.5rem",
                        background:
                          i18n.language === lang.id
                            ? "var(--cds-layer-selected-01)"
                            : "transparent",
                        border: `1px solid ${
                          i18n.language === lang.id
                            ? "var(--cds-border-interactive)"
                            : "var(--cds-border-subtle)"
                        }`,
                        borderRadius: "4px",
                        cursor: "pointer",
                        color:
                          i18n.language === lang.id
                            ? "var(--cds-text-primary)"
                            : "var(--cds-text-secondary)",
                        fontSize: "0.75rem",
                        fontWeight: 500,
                        transition: "all 0.15s ease",
                      }}
                      title={lang.label}
                    >
                      {lang.shortLabel}
                    </button>
                  ))}
                </div>
              </div>

              <SideNavDivider />

              {/* Go to Dashboard Link */}
              <a
                href={import.meta.env.VITE_MAIN_APP_URL || "/"}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.75rem 1rem",
                  color: "var(--cds-link-primary)",
                  textDecoration: "none",
                  fontSize: "0.875rem",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "var(--cds-layer-hover-01)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <Launch size={16} />
                <span>QJudge</span>
              </a>
            </SideNavItems>
          </SideNav>
        </Header>
      )}
    />
  );
};

export default DocsHeader;
