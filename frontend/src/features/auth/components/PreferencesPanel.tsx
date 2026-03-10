/**
 * PreferencesPanel - 偏好設定面板
 *
 * 整合 Theme 和 Language 切換功能
 */

import React, { useState, useEffect } from "react";
import { FormGroup, TextInput, Tag } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { ThemeSwitch } from "@/shared/ui/config/ThemeSwitch";
import { LanguageSwitch } from "@/shared/ui/config/LanguageSwitch";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useUserPreferences } from "@/features/auth/hooks/useUserPreferences";
import type { ThemePreference } from "@/core/entities/auth.entity";
import "./PreferencesPanel.scss";

const ROLE_TAG_TYPE: Record<string, "blue" | "green" | "purple"> = {
  student: "blue",
  teacher: "green",
  admin: "purple",
};

export const PreferencesPanel: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const {
    themePreference,
    updateTheme,
    language,
    updateLanguage,
    displayName,
    updateDisplayName,
  } = useUserPreferences();

  const [localDisplayName, setLocalDisplayName] = useState(displayName);

  useEffect(() => {
    setLocalDisplayName(displayName);
  }, [displayName]);

  const handleDisplayNameBlur = async () => {
    const trimmed = localDisplayName.trim();
    if (trimmed !== displayName) {
      await updateDisplayName(trimmed);
    }
  };

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
          {t("preferences.accountInfo")}
        </h3>
        <div className="preferences-panel__account-info">
          <TextInput
            id="account-username"
            labelText={t("preferences.username")}
            value={user?.username ?? ""}
            readOnly
          />
          <TextInput
            id="account-email"
            labelText={t("preferences.email")}
            value={user?.email ?? ""}
            readOnly
          />
          <div className="preferences-panel__role-field">
            <span className="preferences-panel__role-label">
              {t("preferences.role")}
            </span>
            <Tag type={ROLE_TAG_TYPE[user?.role ?? "student"] ?? "blue"}>
              {t(`user.role.${user?.role ?? "student"}`)}
            </Tag>
          </div>
        </div>
      </div>

      <div className="preferences-panel__section">
        <h3 className="preferences-panel__section-title">
          {t("preferences.displayName")}
        </h3>
        <p className="preferences-panel__section-description">
          {t("preferences.displayNameDescription")}
        </p>
        <FormGroup legendText="">
          <TextInput
            id="display-name"
            labelText=""
            value={localDisplayName}
            onChange={(e) => setLocalDisplayName(e.target.value)}
            onBlur={handleDisplayNameBlur}
            maxLength={50}
            placeholder={t("preferences.displayName")}
          />
        </FormGroup>
      </div>

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
