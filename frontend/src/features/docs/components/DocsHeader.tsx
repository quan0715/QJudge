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
import { BrandLockup } from "@/shared/brand/BrandLockup";
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
  const { preference, setPreference } = useTheme();
  const location = useLocation();
  const [isSideNavExpanded, setIsSideNavExpanded] = useState(false);
  const [docsConfig, setDocsConfig] = useState<DocConfig | null>(null);

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
    setPreference(value);
  };

  return (
    <HeaderContainer
      render={() => (
        <Header aria-label="Documentation">
          <HeaderMenuButton
            className={styles.menuToggle}
            aria-label={tDocs("nav.menu", "選單")}
            onClick={() => setIsSideNavExpanded(!isSideNavExpanded)}
            isActive={isSideNavExpanded}
          />
          <HeaderName
            href={import.meta.env.VITE_MAIN_APP_URL || "/"}
            prefix=""
          >
            <BrandLockup label="QJudge Docs" size={20} />
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
            className={styles.sideNav}
            style={{
              zIndex: 8999,
              top: "3rem",
              height: "calc(100dvh - 3rem)",
            }}
            onSideNavBlur={() => setIsSideNavExpanded(false)}
          >
            <SideNavItems className={styles.sideNavItems}>
              {/* Sidebar Header */}
              <div className={styles.sidebarHeader}>
                <p className={styles.productLabel}>
                  {tDocs("nav.productLabel", "使用說明")}
                </p>
                <h2 className={styles.productTitle}>
                  <BrandLockup size={22} />
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
                  value={preference}
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
                className={styles.dashboardLink}
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
