import { IconButton } from "@carbon/react";
import { OpenPanelLeft } from "@carbon/icons-react";
import { useAppSidebar } from "@/features/app/contexts/AppSidebarContext";
import styles from "./WorkspaceToolBar.module.scss";

export interface WorkspaceToolBarProps {
  /**
   * 排在「展開 app 側欄」之前的內容（例如右側浮動 chat 的歷史切換鈕）。
   */
  leadingBefore?: React.ReactNode;
  /**
   * 是否顯示內建「展開 app 側欄」按鈕（bind `useAppSidebar`，僅在側欄收合時顯示）。
   */
  showAppSidebarExpand?: boolean;
  /**
   * 展開側欄按鈕的 aria / tooltip 文案。
   */
  expandAppSidebarLabel?: string;
  /**
   * 中欄：標題或自訂 UI（純文字、dropdown、表單等由外層組）。
   */
  title: React.ReactNode;
  /** 右側操作列 */
  actions?: React.ReactNode;
  className?: string;
}

const DEFAULT_EXPAND_LABEL = "Expand sidebar";

/**
 * 工作區頂列：可選 leadingBefore → 內建展開 app 側欄 → title slot → actions。
 */
export function WorkspaceToolBar({
  leadingBefore,
  showAppSidebarExpand = false,
  expandAppSidebarLabel = DEFAULT_EXPAND_LABEL,
  title,
  actions,
  className,
}: WorkspaceToolBarProps) {
  const { isOpen: appSidebarOpen, open: openAppSidebar } = useAppSidebar();

  const showExpand = showAppSidebarExpand && !appSidebarOpen;

  if (!title && !actions && !showExpand) return null;

  return (
    <div className={`${styles.root}${className ? ` ${className}` : ""}`}>
      <div className={styles.leading}>
        {leadingBefore}
        {showExpand && (
          <IconButton
            kind="ghost"
            size="md"
            align="bottom"
            label={expandAppSidebarLabel}
            onClick={openAppSidebar}
          >
            <OpenPanelLeft size={20} />
          </IconButton>
        )}
        <div className={styles.titleSlot}>{title}</div>
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
