import { useState, useRef, useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import {
  Header,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  HeaderNavigation,
  HeaderMenuItem,
} from "@carbon/react";
import { Asleep, Light, Home, Language, Checkmark } from "@carbon/icons-react";
import { useTheme } from "@/ui/theme/ThemeContext";
import { useContentLanguage } from "@/contexts/ContentLanguageContext";
import { useTranslation } from "react-i18next";
import { UserMenu } from "@/ui/components/UserMenu";

const ProblemLayout = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const {
    contentLanguage,
    setContentLanguage,
    supportedLanguages,
    getCurrentLanguageShortLabel,
  } = useContentLanguage();
  const { t } = useTranslation();

  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
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
    setContentLanguage(langId as typeof contentLanguage);
    setIsLanguageMenuOpen(false);
  };

  return (
    <div
      style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
    >
      <Header aria-label="Problem Platform">
        <HeaderName
          href="#"
          prefix="NYCU"
          onClick={(e) => {
            e.preventDefault();
            navigate("/dashboard");
          }}
        >
          QJudge
        </HeaderName>
        <HeaderNavigation aria-label="Problem Navigation">
          <HeaderMenuItem onClick={() => navigate("/problems")}>
            {t("nav.backToProblemList")}
          </HeaderMenuItem>
        </HeaderNavigation>
        <HeaderGlobalBar>
          <HeaderGlobalAction
            aria-label={t("nav.dashboard")}
            tooltipAlignment="center"
            onClick={() => navigate("/dashboard")}
          >
            <Home size={20} />
          </HeaderGlobalAction>

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
                {supportedLanguages.map((lang) => (
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
                        contentLanguage === lang.id
                          ? "var(--cds-layer-selected-01)"
                          : "transparent",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor =
                        "var(--cds-layer-hover-01)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor =
                        contentLanguage === lang.id
                          ? "var(--cds-layer-selected-01)"
                          : "transparent")
                    }
                  >
                    <span>{lang.label}</span>
                    {contentLanguage === lang.id && <Checkmark size={16} />}
                  </div>
                ))}
              </div>
            )}
          </div>

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

          {/* User Menu */}
          <UserMenu />
        </HeaderGlobalBar>
      </Header>

      {/* Main Content - Account for fixed header height */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          marginTop: "3rem",
        }}
      >
        <Outlet />
      </div>
    </div>
  );
};

export default ProblemLayout;
