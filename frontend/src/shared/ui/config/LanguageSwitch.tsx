import { Dropdown } from "@carbon/react";
import { Language } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import {
  SUPPORTED_LANGUAGES,
  type SupportedLanguageOption,
} from "@/i18n/languages";
import styles from "./SwitchDropdown.module.scss";

export interface LanguageSwitchProps {
  /** 當前選中的語言 */
  value: string;
  /** 語言變更時的回調 */
  onChange: (value: string) => void;
  /** 可用語言列表（預設為平台支援語言） */
  languages?: ReadonlyArray<SupportedLanguageOption>;
  /** 顯示標籤 */
  showLabel?: boolean;
  /** 自訂標籤文字 */
  label?: string;
  /** 尺寸 */
  size?: "sm" | "md" | "lg";
  /** E2E 測試識別 */
  testId?: string;
}

export const LanguageSwitch: React.FC<LanguageSwitchProps> = ({
  value,
  onChange,
  languages = SUPPORTED_LANGUAGES,
  showLabel = true,
  label,
  size = "sm",
  testId,
}) => {
  const { t } = useTranslation();

  const selectedItem =
    languages.find((lang) => lang.id === value) || languages[0];

  const handleChange = (data: {
    selectedItem: SupportedLanguageOption | null;
  }) => {
    if (data.selectedItem) {
      onChange(data.selectedItem.id);
    }
  };

  return (
    <Dropdown
      id="language-dropdown"
      data-testid={testId}
      titleText={showLabel ? (label || t("language.title")) : ""}
      label={t("language.select")}
      size={size}
      items={[...languages]}
      selectedItem={selectedItem}
      onChange={handleChange}
      itemToString={(item: SupportedLanguageOption | null) => item?.label || ""}
      renderSelectedItem={(item: SupportedLanguageOption) => (
        <span className={styles.dropdownItem}>
          <Language size={16} />
          <span>{item.label}</span>
        </span>
      )}
      itemToElement={(item: SupportedLanguageOption) => (
        <span className={styles.dropdownItem}>
          <Language size={16} />
          <span>{item.label}</span>
        </span>
      )}
    />
  );
};

export default LanguageSwitch;
