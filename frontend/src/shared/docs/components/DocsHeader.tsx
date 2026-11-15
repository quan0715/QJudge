import { useState, useEffect, type ComponentType } from "react";
import {
  Dropdown,
  Header,
  HeaderContainer,
  HeaderGlobalBar,
  HeaderMenuButton,
  HeaderName,
  SideNav,
  SkeletonText,
} from "@carbon/react";
import { Language, Light, Asleep, Laptop } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import type { DocSiteConfig } from "@/core/docs";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import type { ThemeValue } from "@/shared/ui/config";
import { useDocsFramework } from "../contexts/DocsFrameworkContext";
import DocsSearchDropdown from "./DocsSearchDropdown";
import DocSidebar from "./DocSidebar";
import styles from "./DocsHeader.module.scss";

const MOBILE_BREAKPOINT_QUERY = "(max-width: 768px)";

interface HeaderLanguageOption {
  id: string;
  label: string;
}

interface HeaderThemeOption {
  id: ThemeValue;
  label: string;
  icon: ComponentType<{ size?: number }>;
}

function resolveSlugFromPath(
  pathname: string,
  routeBase: string,
  defaultDoc?: string,
): string {
  const normalizedBase = routeBase.replace(/\/$/, "");
  const prefix = `${normalizedBase}/`;
  if (pathname.startsWith(prefix)) {
    return pathname.slice(prefix.length) || defaultDoc || "";
  }
  if (pathname === normalizedBase) {
    return defaultDoc || "";
  }
  return defaultDoc || "";
}

const DocsHeader: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { t: tDocs } = useTranslation("docs");
  const { preference, setPreference } = useTheme();
  const location = useLocation();
  const { brand, routeBase, languages, source } = useDocsFramework();
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches
      : false,
  );
  const [isSideNavExpanded, setIsSideNavExpanded] = useState(false);
  const [docsConfig, setDocsConfig] = useState<DocSiteConfig | null>(null);

  const currentDocSlug = resolveSlugFromPath(
    location.pathname,
    routeBase,
    docsConfig?.defaultDoc,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    const handleMediaChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
      if (!event.matches) {
        setIsSideNavExpanded(false);
      }
    };

    mediaQuery.addEventListener("change", handleMediaChange);
    return () => {
      mediaQuery.removeEventListener("change", handleMediaChange);
    };
  }, []);

  useEffect(() => {
    let active = true;
    source
      .loadConfig()
      .then((data) => {
        if (active) setDocsConfig(data);
      })
      .catch((err) => {
        console.error("Failed to load docs config:", err);
      });
    return () => {
      active = false;
    };
  }, [source]);

  const handleLanguageSelect = (langId: string) => {
    void i18n.changeLanguage(langId);
  };

  const handleThemeChange = (value: ThemeValue) => {
    setPreference(value);
  };

  const productLabelKey = brand.productLabelKey || "nav.productLabel";

  const languageItems: HeaderLanguageOption[] = languages.map((lang) => ({
    id: lang.id,
    label: lang.label,
  }));
  const selectedLanguage =
    languageItems.find((lang) => lang.id === i18n.language) ||
    languageItems.find((lang) => i18n.language?.startsWith(lang.id)) ||
    languageItems[0];

  const themeItems: HeaderThemeOption[] = [
    { id: "light", label: t("theme.light", "淺色"), icon: Light },
    { id: "dark", label: t("theme.dark", "深色"), icon: Asleep },
    { id: "system", label: t("theme.system", "跟隨系統"), icon: Laptop },
  ];
  const selectedTheme =
    themeItems.find((item) => item.id === preference) || themeItems[2];

  return (
    <HeaderContainer
      render={() => (
        <Header aria-label={brand.title || "Documentation"}>
          {isMobile && (
            <HeaderMenuButton
              className={styles.menuToggle}
              aria-label={tDocs("nav.menu", "選單")}
              onClick={() => setIsSideNavExpanded((prev) => !prev)}
              isActive={isSideNavExpanded}
            />
          )}
          <HeaderName href={brand.homeHref || routeBase} prefix="">
            {brand.headerBrand ?? <span>{brand.title}</span>}
          </HeaderName>

          <HeaderGlobalBar className={styles.headerActions}>
            <div className={styles.searchWrapper}>
              <DocsSearchDropdown />
            </div>

            <div className={styles.navMenus}>
              <div
                className={styles.dropdownWrapper}
                data-testid="docs-navbar-language-btn"
              >
                <Dropdown
                  id="docs-navbar-language-dropdown"
                  type="inline"
                  size="sm"
                  hideLabel
                  className={styles.inlineDropdown}
                  titleText={t("language.title", "語言")}
                  label={t("language.select", "選擇語言")}
                  items={languageItems}
                  selectedItem={selectedLanguage}
                  itemToString={(item: HeaderLanguageOption | null) =>
                    item?.label || ""
                  }
                  renderSelectedItem={(item: HeaderLanguageOption) => (
                    <span className={styles.dropdownItem}>
                      <Language size={16} />
                      <span>{item.label}</span>
                    </span>
                  )}
                  itemToElement={(item: HeaderLanguageOption) => (
                    <span className={styles.dropdownItem}>
                      <Language size={16} />
                      <span>{item.label}</span>
                    </span>
                  )}
                  onChange={({ selectedItem }) => {
                    if (selectedItem) handleLanguageSelect(selectedItem.id);
                  }}
                />
              </div>

              <div
                className={styles.dropdownWrapper}
                data-testid="docs-navbar-theme-btn"
              >
                <Dropdown
                  id="docs-navbar-theme-dropdown"
                  type="inline"
                  size="sm"
                  hideLabel
                  className={styles.inlineDropdown}
                  titleText={t("theme.title", "主題")}
                  label={t("theme.select", "選擇主題")}
                  items={themeItems}
                  selectedItem={selectedTheme}
                  itemToString={(item: HeaderThemeOption | null) =>
                    item?.label || ""
                  }
                  renderSelectedItem={(item: HeaderThemeOption) => {
                    const Icon = item.icon;
                    return (
                      <span className={styles.dropdownItem}>
                        <Icon size={16} />
                        <span>{item.label}</span>
                      </span>
                    );
                  }}
                  itemToElement={(item: HeaderThemeOption) => {
                    const Icon = item.icon;
                    return (
                      <span className={styles.dropdownItem}>
                        <Icon size={16} />
                        <span>{item.label}</span>
                      </span>
                    );
                  }}
                  onChange={({ selectedItem }) => {
                    if (selectedItem) handleThemeChange(selectedItem.id);
                  }}
                />
              </div>
            </div>
          </HeaderGlobalBar>

          {isMobile && (
            <SideNav
              aria-label={tDocs(productLabelKey, "使用說明")}
              expanded={isSideNavExpanded}
              isPersistent={false}
              className={styles.sideNav}
              onSideNavBlur={() => setIsSideNavExpanded(false)}
            >
              <div className={styles.sidebarHeader}>
                <p className={styles.productLabel}>
                  {tDocs(productLabelKey, "使用說明")}
                </p>
                <h2 className={styles.productTitle}>
                  {brand.sidebarBrand ?? <span>{brand.title}</span>}
                </h2>
              </div>

              <div className={styles.sideNavBody}>
                {docsConfig ? (
                  <DocSidebar
                    config={docsConfig}
                    currentSlug={currentDocSlug}
                    onLinkClick={() => setIsSideNavExpanded(false)}
                  />
                ) : (
                  <div className={styles.skeletonPadding}>
                    <SkeletonText paragraph lineCount={8} />
                  </div>
                )}
              </div>
            </SideNav>
          )}
        </Header>
      )}
    />
  );
};

export default DocsHeader;
