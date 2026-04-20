import { IconButton } from "@carbon/react";
import { OpenPanelLeft, SidePanelClose } from "@carbon/icons-react";
import { useWorkspace } from "@/features/app/contexts/WorkspaceContext";
import styles from "./WorkspaceToolBar.module.scss";

export interface WorkspaceToolBarProps {
  /**
   * 排在「展開 app 側欄」之前的內容（例如右側浮動 chat 的歷史切換鈕）。
   */
  leadingBefore?: React.ReactNode;
  /**
   * 是否顯示內建「展開/關閉 app 側欄」按鈕。桌面只在側欄收合時顯示展開鈕；
   * 行動裝置則會在 drawer 開啟時切換為關閉鈕，方便手機使用者從 toolbar 關掉 drawer。
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
const DEFAULT_CLOSE_LABEL = "Close sidebar";

/**
 * 工作區頂列：可選 leadingBefore → 內建展開/關閉 app 側欄 → title slot → actions。
 */
export function WorkspaceToolBar({
  leadingBefore,
  showAppSidebarExpand = false,
  expandAppSidebarLabel = DEFAULT_EXPAND_LABEL,
  title,
  actions,
  className,
}: WorkspaceToolBarProps) {
  const { isMobile, left } = useWorkspace();

  const showExpand = showAppSidebarExpand && !left.isOpen;
  // On mobile the sidebar is an overlay drawer; once open, the user needs
  // a toolbar-level affordance to dismiss it (backdrop is hidden behind content).
  const showMobileClose = showAppSidebarExpand && isMobile && left.isOpen;

  if (!title && !actions && !showExpand && !showMobileClose) return null;

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
            onClick={left.open}
          >
            <OpenPanelLeft size={20} />
          </IconButton>
        )}
        {showMobileClose && (
          <IconButton
            kind="ghost"
            size="md"
            align="bottom"
            label={DEFAULT_CLOSE_LABEL}
            onClick={left.close}
          >
            <SidePanelClose size={20} />
          </IconButton>
        )}
        <div className={styles.titleSlot}>{title}</div>
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
