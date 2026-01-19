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
import { Launch } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import { ThemeSwitch, LanguageSwitch, type ThemeValue } from "@/shared/ui/config";
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

const DocsHeader: React.FC = () => {
  const { i18n } = useTranslation();
  const { t: tDocs } = useTranslation("docs");
  const { setTheme } = useTheme();
  const location = useLocation();
  const [isSideNavExpanded, setIsSideNavExpanded] = useState(false);
  const [docsConfig, setDocsConfig] = useState<DocConfig | null>(null);
  const [currentTheme, setCurrentTheme] = useState<ThemeValue>(() => {
    // Use unified localStorage key (same as useUserPreferences)
    const stored = localStorage.getItem("themePreference");
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
    // Use unified localStorage key (same as useUserPreferences)
    localStorage.setItem("themePreference", value);

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

  return (
    <HeaderContainer
      render={() => (
        <Header aria-label="QJudge Documentation">
          <HeaderMenuButton
            aria-label={tDocs("nav.menu", "選單")}
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
                    onLinkClick={() => setIsSideNavExpanded(false)}
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
                <ThemeSwitch
                  value={currentTheme}
                  onChange={handleThemeChange}
                />
              </div>

              {/* Language Section */}
              <div style={{ padding: "0.75rem 1rem" }}>
                <LanguageSwitch
                  value={i18n.language}
                  onChange={handleLanguageSelect}
                />
              </div>

              <SideNavDivider />

              {/* Go to Dashboard Link */}
              <a
                href={import.meta.env.VITE_MAIN_APP_URL || "/"}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsSideNavExpanded(false)}
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
