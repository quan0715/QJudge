import { Dropdown } from "@carbon/react";
import { Light, Asleep, Laptop } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

export type ThemeValue = "light" | "dark" | "system";

export interface ThemeSwitchProps {
  /** 當前選中的主題 */
  value: ThemeValue;
  /** 主題變更時的回調 */
  onChange: (value: ThemeValue) => void;
  /** 顯示標籤 */
  showLabel?: boolean;
  /** 自訂標籤文字 */
  label?: string;
  /** 尺寸 */
  size?: "sm" | "md" | "lg";
}

interface ThemeItem {
  id: ThemeValue;
  label: string;
  icon: React.ReactNode;
}

export const ThemeSwitch: React.FC<ThemeSwitchProps> = ({
  value,
  onChange,
  showLabel = true,
  label,
  size = "sm",
}) => {
  const { t } = useTranslation();

  const themeItems: ThemeItem[] = [
    { id: "light", label: t("theme.light"), icon: <Light size={16} /> },
    { id: "dark", label: t("theme.dark"), icon: <Asleep size={16} /> },
    { id: "system", label: t("theme.system"), icon: <Laptop size={16} /> },
  ];

  const selectedItem = themeItems.find((item) => item.id === value) || themeItems[0];

  const handleChange = (data: { selectedItem: ThemeItem | null }) => {
    if (data.selectedItem) {
      onChange(data.selectedItem.id);
    }
  };

  return (
    <Dropdown
      id="theme-dropdown"
      titleText={showLabel ? (label || t("theme.title")) : ""}
      label={t("theme.select")}
      size={size}
      items={themeItems}
      selectedItem={selectedItem}
      onChange={handleChange}
      itemToString={(item: ThemeItem | null) => item?.label || ""}
      itemToElement={(item: ThemeItem) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
          {item.icon}
          <span>{item.label}</span>
        </span>
      )}
    />
  );
};

export default ThemeSwitch;
