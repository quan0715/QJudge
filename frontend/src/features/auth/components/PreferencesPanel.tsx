import React from "react";
import { useTranslation } from "react-i18next";
import { ThemeSwitch } from "@/shared/ui/config/ThemeSwitch";
import { LanguageSwitch } from "@/shared/ui/config/LanguageSwitch";
import { Section } from "@/shared/layout/SettingsPanel";
import { useUserPreferences } from "@/features/auth/hooks/useUserPreferences";
import type { ThemePreference } from "@/core/entities/auth.entity";
import "./PreferencesPanel.scss";

export const PreferencesPanel: React.FC = () => {
  const { t } = useTranslation();
  const { themePreference, updateTheme, language, updateLanguage } = useUserPreferences();

  return (
    <>
      <Section title={t("preferences.title", "偏好設定")}>
        <div className="preferences-panel__row">
          <div className="preferences-panel__row-label">
            <span className="preferences-panel__row-title">
              {t("preferences.theme", "主題")}
            </span>
            <span className="preferences-panel__row-desc">
              {t("preferences.themeDescription", "選擇您偏好的介面主題")}
            </span>
          </div>
          <div className="preferences-panel__row-control">
            <ThemeSwitch
              value={themePreference as ThemePreference}
              onChange={(theme) => updateTheme(theme)}
              showLabel={false}
              testId="settings-theme-dropdown"
            />
          </div>
        </div>

        <div className="preferences-panel__row">
          <div className="preferences-panel__row-label">
            <span className="preferences-panel__row-title">
              {t("preferences.language", "語言")}
            </span>
            <span className="preferences-panel__row-desc">
              {t("preferences.languageDescription", "選擇您偏好的介面語言")}
            </span>
          </div>
          <div className="preferences-panel__row-control">
            <LanguageSwitch
              value={language}
              onChange={(lang) => updateLanguage(lang)}
              showLabel={false}
              testId="settings-language-dropdown"
            />
          </div>
        </div>
      </Section>
    </>
  );
};

export default PreferencesPanel;
