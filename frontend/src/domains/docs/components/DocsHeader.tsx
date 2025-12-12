import { useState, useRef, useEffect } from "react";
import {
  Header,
  HeaderContainer,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  Button,
} from "@carbon/react";
import {
  Language,
  Checkmark,
  Launch,
  Light,
  Asleep,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import { useTheme } from "@/ui/theme/ThemeContext";
import DocsSearchDropdown from "./DocsSearchDropdown";
import styles from "./DocsHeader.module.scss";

const DocsHeader: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement>(null);

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
          <HeaderName
            href={import.meta.env.VITE_MAIN_APP_URL || "/"}
            prefix="QJudge"
          >
            DOCS
          </HeaderName>

          <HeaderGlobalBar>
            <DocsSearchDropdown />

            {/* Language Switcher */}
            <div ref={languageMenuRef} className={styles.languageMenu}>
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
                <div className={styles.languageDropdown}>
                  <div className={styles.languageDropdownHeader}>
                    {t("language.selectLanguage")}
                  </div>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <div
                      key={lang.id}
                      onClick={() => handleLanguageSelect(lang.id)}
                      className={`${styles.languageOption} ${i18n.language === lang.id ? styles.selected : ''}`}
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
              className={styles.goToQJudgeButton}
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
              }}
            >
              {t("nav.dashboard")}
            </Button>
          </HeaderGlobalBar>
        </Header>
      )}
    />
  );
};

export default DocsHeader;
