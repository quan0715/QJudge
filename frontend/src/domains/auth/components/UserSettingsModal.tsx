import React from "react";
import { Modal, RadioButtonGroup, RadioButton, FormGroup } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useContentLanguage } from "@/contexts/ContentLanguageContext";
import type { ThemePreference } from "@/core/entities/auth.entity";

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const { themePreference, updateTheme } = useUserPreferences();
  const { contentLanguage, supportedLanguages } = useContentLanguage();
  const { updateLanguage } = useUserPreferences();

  const handleThemeChange = async (value: ThemePreference) => {
    await updateTheme(value);
  };

  const handleLanguageChange = async (value: string) => {
    await updateLanguage(value);
  };

  return (
    <Modal
      open={isOpen}
      onRequestClose={onClose}
      modalHeading={t("preferences.title")}
      passiveModal
      size="sm"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Theme Selection */}
        <FormGroup legendText={t("preferences.theme")}>
          <RadioButtonGroup
            name="theme-selection"
            valueSelected={themePreference}
            onChange={(value) => handleThemeChange(value as ThemePreference)}
            orientation="vertical"
          >
            <RadioButton
              id="theme-light"
              value="light"
              labelText={t("theme.light")}
            />
            <RadioButton
              id="theme-dark"
              value="dark"
              labelText={t("theme.dark")}
            />
            <RadioButton
              id="theme-system"
              value="system"
              labelText={t("theme.system")}
            />
          </RadioButtonGroup>
        </FormGroup>

        {/* Language Selection */}
        <FormGroup legendText={t("preferences.language")}>
          <RadioButtonGroup
            name="language-selection"
            valueSelected={contentLanguage}
            onChange={(value) => handleLanguageChange(value as string)}
            orientation="vertical"
          >
            {supportedLanguages.map((lang) => (
              <RadioButton
                key={lang.id}
                id={`lang-${lang.id}`}
                value={lang.id}
                labelText={lang.label}
              />
            ))}
          </RadioButtonGroup>
        </FormGroup>
      </div>
    </Modal>
  );
};

export default UserSettingsModal;
