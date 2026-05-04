import { IconButton } from "@carbon/react";
import { SidePanelClose, SidePanelOpen } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { SideMenu } from "./SideMenu";
import styles from "./AppSidebar.module.scss";

interface AppSidebarProps {
  collapsed?: boolean;
  compact?: boolean;
  onToggleCollapse?: () => void;
}

export function AppSidebar({
  collapsed = false,
  compact = false,
  onToggleCollapse,
}: AppSidebarProps) {
  const { t } = useTranslation("common");

  return (
    <div
      className={[
        styles.sidebar,
        collapsed ? styles.collapsed : "",
        compact ? styles.compact : "",
      ].filter(Boolean).join(" ")}
    >
      {/* ── Navigation ── */}
      <div className={styles.nav}>
        <SideMenu variant="panel" compact={compact} />
      </div>

      <div className={styles.footer}>
        <IconButton
          kind="ghost"
          size="md"
          label={compact ? t("ui.expandSidebar", "展開側欄") : t("ui.collapseSidebar", "收合側欄")}
          align="top"
          onClick={onToggleCollapse}
          className={styles.collapseBtn}
        >
          {compact ? <SidePanelOpen size={20} /> : <SidePanelClose size={20} />}
        </IconButton>
      </div>
    </div>
  );
}
