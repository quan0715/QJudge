import { Menu, Close } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

interface SideMenuToggleProps {
  isOpen: boolean;
  onClick: () => void;
}

export const SideMenuToggle: React.FC<SideMenuToggleProps> = ({
  isOpen,
  onClick,
}) => {
  const { t } = useTranslation("common");

  return (
    <button
      type="button"
      data-side-menu-toggle
      className="side-menu-toggle"
      aria-label={t("header.menu", "Menu")}
      aria-expanded={isOpen}
      onClick={onClick}
    >
      {isOpen ? <Close size={20} /> : <Menu size={20} />}
    </button>
  );
};
