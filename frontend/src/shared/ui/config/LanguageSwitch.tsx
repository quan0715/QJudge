import { Dropdown } from "@carbon/react";
import { Language } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "@/i18n";

type SupportedLanguageItem = (typeof SUPPORTED_LANGUAGES)[number];

export interface LanguageSwitchProps {
  /** 當前選中的語言 */
  value: string;
  /** 語言變更時的回調 */
  onChange: (value: string) => void;
  /** 顯示標籤 */
  showLabel?: boolean;
  /** 自訂標籤文字 */
  label?: string;
  /** 尺寸 */
  size?: "sm" | "md" | "lg";
}

export const LanguageSwitch: React.FC<LanguageSwitchProps> = ({
  value,
  onChange,
  showLabel = true,
  label,
  size = "sm",
}) => {
  const { t } = useTranslation();

  const selectedItem = SUPPORTED_LANGUAGES.find((lang) => lang.id === value) || SUPPORTED_LANGUAGES[0];

  const handleChange = (data: { selectedItem: SupportedLanguageItem | null }) => {
    if (data.selectedItem) {
      onChange(data.selectedItem.id);
    }
  };

  return (
    <Dropdown
      id="language-dropdown"
      titleText={showLabel ? (label || t("language.title")) : ""}
      label={t("language.select")}
      size={size}
      items={[...SUPPORTED_LANGUAGES]}
      selectedItem={selectedItem}
      onChange={handleChange}
      itemToString={(item: SupportedLanguageItem | null) => item?.label || ""}
      itemToElement={(item: SupportedLanguageItem) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
          <Language size={16} />
          <span>{item.label}</span>
        </span>
      )}
    />
  );
};

export default LanguageSwitch;
