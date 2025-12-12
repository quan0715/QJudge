import { useState, useRef, useEffect } from "react";
import {
  Header,
  HeaderContainer,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  HeaderMenuButton,
  SideNav,
  SideNavItems,
  SideNavMenu,
  SideNavMenuItem,
  Button,
} from "@carbon/react";
import {
  Language,
  Checkmark,
  Launch,
  Light,
  Asleep,
  Document,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import { useTheme } from "@/ui/theme/ThemeContext";
import DocsSearchDropdown from "./DocsSearchDropdown";

interface DocConfig {
  sections: Array<{
    id: string;
    items: string[];
  }>;
  defaultDoc: string;
}

const DocsHeader: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { t: tDocs } = useTranslation("docs");
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [isSideNavExpanded, setIsSideNavExpanded] = useState(false);
  const [docsConfig, setDocsConfig] = useState<DocConfig | null>(null);
  const languageMenuRef = useRef<HTMLDivElement>(null);

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

  // Close language menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        languageMenuRef.current &&
        !languageMenuRef.current.contains(event.target as Node)
      ) {
        setIsLanguageMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLanguageSelect = (langId: string) => {
    i18n.changeLanguage(langId);
    setIsLanguageMenuOpen(false);
  };

  const getCurrentLanguageShortLabel = () => {
    const currentLang = SUPPORTED_LANGUAGES.find(
      (lang) => lang.id === i18n.language
    );
    return currentLang?.shortLabel || "中";
  };

  return (
    <HeaderContainer
      render={() => (
        <Header aria-label="QJudge Documentation">
          <HeaderMenuButton
            aria-label={t("header.menu", "選單")}
            onClick={() => setIsSideNavExpanded(!isSideNavExpanded)}
            isActive={isSideNavExpanded}
            aria-expanded={isSideNavExpanded}
          />
          <HeaderName
            href={import.meta.env.VITE_MAIN_APP_URL || "/"}
            prefix="QJudge"
          >
            DOCS
          </HeaderName>

          <HeaderGlobalBar>
            <DocsSearchDropdown />

            {/* Language Switcher */}
            <div ref={languageMenuRef} style={{ position: "relative" }}>
              <HeaderGlobalAction
                aria-label={t("language.switchTo")}
                tooltipAlignment="center"
                isActive={isLanguageMenuOpen}
                onClick={() => setIsLanguageMenuOpen(!isLanguageMenuOpen)}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "4px" }}
                >
                  <Language size={20} />
                  <span style={{ fontSize: "12px", fontWeight: 500 }}>
                    {getCurrentLanguageShortLabel()}
                  </span>
                </div>
              </HeaderGlobalAction>
              {isLanguageMenuOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    backgroundColor: "var(--cds-layer-01)",
                    border: "1px solid var(--cds-border-subtle)",
                    borderRadius: "4px",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                    minWidth: "150px",
                    zIndex: 9999,
                  }}
                >
                  <div
                    style={{
                      padding: "0.5rem 1rem",
                      fontSize: "0.75rem",
                      color: "var(--cds-text-secondary)",
                      borderBottom: "1px solid var(--cds-border-subtle)",
                    }}
                  >
                    {t("language.selectLanguage")}
                  </div>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <div
                      key={lang.id}
                      onClick={() => handleLanguageSelect(lang.id)}
                      style={{
                        padding: "0.75rem 1rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        backgroundColor:
                          i18n.language === lang.id
                            ? "var(--cds-layer-selected-01)"
                            : "transparent",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor =
                          "var(--cds-layer-hover-01)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor =
                          i18n.language === lang.id
                            ? "var(--cds-layer-selected-01)"
                            : "transparent")
                      }
                    >
                      <span>{lang.label}</span>
                      {i18n.language === lang.id && <Checkmark size={16} />}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Theme Toggle */}
            <HeaderGlobalAction
              aria-label={
                theme === "white"
                  ? t("theme.switchToDark")
                  : t("theme.switchToLight")
              }
              tooltipAlignment="center"
              onClick={toggleTheme}
            >
              {theme === "white" ? <Asleep size={20} /> : <Light size={20} />}
            </HeaderGlobalAction>

            {/* Go to QJudge Button */}
            <Button
              kind="ghost"
              size="sm"
              renderIcon={Launch}
              href={import.meta.env.VITE_MAIN_APP_URL || "/"}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
              }}
            >
              {t("nav.dashboard")}
            </Button>
          </HeaderGlobalBar>

          {/* Mobile Side Navigation with Docs Menu */}
          <SideNav
            aria-label={tDocs("nav.productLabel", "使用說明")}
            expanded={isSideNavExpanded}
            isPersistent={false}
            onSideNavBlur={() => setIsSideNavExpanded(false)}
          >
            <SideNavItems>
              {docsConfig && (
                <SideNavMenu
                  renderIcon={Document}
                  title={tDocs("nav.productLabel", "使用說明")}
                  defaultExpanded
                  isActive
                >
                  {docsConfig.sections.map((section) =>
                    section.items.map((item) => (
                      <SideNavMenuItem
                        key={item}
                        href="#"
                        onClick={(e: React.MouseEvent) => {
                          e.preventDefault();
                          navigate(`/docs/${item}`);
                          setIsSideNavExpanded(false);
                        }}
                        isActive={currentDocSlug === item}
                      >
                        {tDocs(`nav.items.${item}`, item)}
                      </SideNavMenuItem>
                    ))
                  )}
                </SideNavMenu>
              )}
            </SideNavItems>
          </SideNav>
        </Header>
      )}
    />
  );
};

export default DocsHeader;
