/**
 * PreferencesPanel - 偏好設定面板
 *
 * 整合 Theme 和 Language 切換功能
 */

import React from "react";
import { FormGroup } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { ThemeSwitch } from "@/shared/ui/config/ThemeSwitch";
import { LanguageSwitch } from "@/shared/ui/config/LanguageSwitch";
import { useUserPreferences } from "@/features/auth/hooks/useUserPreferences";
import type { ThemePreference } from "@/core/entities/auth.entity";
import "./PreferencesPanel.scss";

export const PreferencesPanel: React.FC = () => {
  const { t } = useTranslation();
  const { themePreference, updateTheme, language, updateLanguage } =
    useUserPreferences();

  const handleThemeChange = async (theme: ThemePreference) => {
    await updateTheme(theme);
  };

  const handleLanguageChange = async (lang: string) => {
    await updateLanguage(lang);
  };

  return (
    <div className="preferences-panel">
      <div className="preferences-panel__section">
        <h3 className="preferences-panel__section-title">
          {t("preferences.theme")}
        </h3>
        <p className="preferences-panel__section-description">
          {t("preferences.themeDescription", "選擇您偏好的介面主題")}
        </p>
        <FormGroup legendText="">
          <ThemeSwitch
            value={themePreference as ThemePreference}
            onChange={handleThemeChange}
            showLabel
          />
        </FormGroup>
      </div>

      <div className="preferences-panel__section">
        <h3 className="preferences-panel__section-title">
          {t("preferences.language")}
        </h3>
        <p className="preferences-panel__section-description">
          {t("preferences.languageDescription", "選擇您偏好的介面語言")}
        </p>
        <FormGroup legendText="">
          <LanguageSwitch
            value={language}
            onChange={handleLanguageChange}
            showLabel
          />
        </FormGroup>
      </div>
    </div>
  );
};

export default PreferencesPanel;
