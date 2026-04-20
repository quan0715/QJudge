import { IconButton } from "@carbon/react";
import { OpenPanelLeft } from "@carbon/icons-react";
import { useWorkspace } from "@/features/app/contexts/WorkspaceContext";
import { useRegisterPageToolbar } from "@/features/app/contexts/WorkspaceToolbarSlot";
import styles from "./WorkspaceToolBar.module.scss";

export interface WorkspaceToolBarProps {
  /** 排在 sidebar 控制 / title 之前的內容（例如 chat 歷史切換鈕）。 */
  leadingBefore?: React.ReactNode;
  /** 中欄：標題或自訂 UI（純文字、dropdown、表單等由外層組）。 */
  title: React.ReactNode;
  /** 右側操作列 */
  actions?: React.ReactNode;
  /**
   * 嵌入在非 main content（例如右側 chat dock 或 bottom sheet）時傳 true，
   * 隱藏內建的展開/關閉 app sidebar 按鈕 — 那個控制屬於 main content。
   */
  hideSidebarControl?: boolean;
  className?: string;
}

/**
 * 工作區頂列：leading + sidebar control（自動）+ title + actions。
 *
 * 內建邏輯：
 * - 當 `left.isOpen === false`（desktop 收合 或 mobile drawer 關閉）→ 顯示展開鈕
 * - 當 `left.isOpen === true` → 不顯示 sidebar 按鈕（desktop 用 sidebar 本身的收合鈕；
 *   mobile 則由 drawer 覆蓋整個 viewport，關閉鈕在 drawer 內部的 AppSidebar header）
 *
 * 頁面 render 這個 component 即表示「本頁 main content 的 toolbar 由我提供」，
 * Shell 不再補 fallback chrome。
 */
export function WorkspaceToolBar({
  leadingBefore,
  title,
  actions,
  hideSidebarControl = false,
  className,
}: WorkspaceToolBarProps) {
  const { left } = useWorkspace();
  useRegisterPageToolbar();

  const showExpand = !hideSidebarControl && !left.isOpen;

  return (
    <div className={`${styles.root}${className ? ` ${className}` : ""}`}>
      <div className={styles.leading}>
        {leadingBefore}
        {showExpand && (
          <IconButton
            kind="ghost"
            size="md"
            align="bottom"
            label="Expand sidebar"
            onClick={left.open}
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
