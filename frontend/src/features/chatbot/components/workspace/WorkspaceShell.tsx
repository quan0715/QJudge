import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import AiLaunch from "@carbon/icons-react/es/AiLaunch.js";
import { AppSidebar } from "@/features/app/components/AppSidebar";
import { useWorkspace } from "@/features/app/contexts/WorkspaceContext";
import { ChatContainer } from "../chat-ui/ChatContainer";
import styles from "./WorkspaceShell.module.scss";

const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 700;
const DEFAULT_PANEL_WIDTH = 400;
const STORAGE_KEY = "workspace_panel_width";

function getSavedWidth(): number {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v) {
      const n = parseInt(v, 10);
      if (n >= MIN_PANEL_WIDTH && n <= MAX_PANEL_WIDTH) return n;
    }
  } catch { /* ignore */ }
  return DEFAULT_PANEL_WIDTH;
}

/** Portal mount target for overlays. Returns null if document is unavailable (SSR). */
function getPortalRoot(): Element | null {
  if (typeof document === "undefined") return null;
  return document.getElementById("modal-portal-root") ?? document.body;
}

interface WorkspaceShellProps {
  children: React.ReactNode;
  /**
   * 當外層已經有自己的 sidebar（例如 AdminShellLayout），傳 true 關閉內建 AppSidebar
   * 與左側 drawer，只保留右側 chat 面板行為。
   */
  omitAppSidebar?: boolean;
}

/**
 * App-wide 3-panel shell：
 *
 * - 桌面：左 AppSidebar + 中（children）+ 右 ChatContainer
 * - 行動：中（children）為主；左以 portal drawer、右以 portal bottom-sheet 呈現
 *
 * 子節點（頁面）只負責 children 的內容。行為由 `useWorkspace()` 管理；
 * 頁面可呼叫 `useDisablePanel('right')` 等 hook 宣告式禁用面板
 * （例如 `/chat` 主畫面、競賽進行中）。
 */
export function WorkspaceShell({ children, omitAppSidebar = false }: WorkspaceShellProps) {
  const { isMobile, left, right } = useWorkspace();

  const leftEnabled = !omitAppSidebar;
  const dockLeft = leftEnabled && !isMobile;
  const showLeftMobileOverlay = leftEnabled && isMobile && left.isOpen;
  const dockRight = !isMobile && right.isOpen;
  const showRightMobileSheet = isMobile && right.isOpen;
  const showFab = right.isAllowed && !right.isOpen && !right.isDisabled;

  const panelRef = useRef<HTMLElement>(null);
  const dragging = useRef(false);

  // Close overlays with Escape key for keyboard users.
  useEffect(() => {
    if (!showLeftMobileOverlay && !showRightMobileSheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showRightMobileSheet) right.close();
      else if (showLeftMobileOverlay) left.close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showLeftMobileOverlay, showRightMobileSheet, left, right]);

  const startResize = useCallback(() => {
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (clientX: number) => {
      if (!dragging.current || !panelRef.current) return;
      const shellRect = panelRef.current.parentElement?.getBoundingClientRect();
      if (!shellRect) return;
      const newWidth = Math.min(
        MAX_PANEL_WIDTH,
        Math.max(MIN_PANEL_WIDTH, shellRect.right - clientX),
      );
      panelRef.current.style.width = `${newWidth}px`;
    };

    const onEnd = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onEnd);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onEnd);
      if (panelRef.current) {
        try { localStorage.setItem(STORAGE_KEY, String(panelRef.current.offsetWidth)); } catch { /* ignore */ }
      }
    };

    const onMouseMove = (ev: MouseEvent) => onMove(ev.clientX);
    const onTouchMove = (ev: TouchEvent) => {
      ev.preventDefault();
      onMove(ev.touches[0].clientX);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onEnd);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onEnd);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startResize();
  }, [startResize]);

  const handleTouchStart = useCallback(() => {
    startResize();
  }, [startResize]);

  const portalRoot = getPortalRoot();

  return (
    <div className={styles.shell}>
      {dockLeft && (
        <aside className={`${styles.leftPanel} ${left.isOpen ? "" : styles.leftPanelCollapsed}`}>
          <AppSidebar collapsed={!left.isOpen} onToggleCollapse={left.toggle} />
        </aside>
      )}

      <div className={styles.mainColumn}>
        <div
          className={styles.content}
          data-chatbot-sidebar-open={right.isOpen ? "true" : "false"}
        >
          {children}
        </div>
      </div>

      <aside
        ref={panelRef}
        className={`${styles.panel} ${dockRight ? styles.panelOpen : ""}`}
        style={dockRight ? { width: getSavedWidth() } : undefined}
      >
        {dockRight && (
          <>
            <div
              className={styles.resizeHandle}
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
              role="separator"
              aria-orientation="vertical"
              aria-label="調整面板寬度"
              tabIndex={0}
            />
            <div className={styles.panelContent}>
              <ChatContainer mode="sidebar" onClose={right.close} />
            </div>
          </>
        )}
      </aside>

      {portalRoot && showLeftMobileOverlay && createPortal(
        <div
          className={styles.mobileLeftOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="App sidebar"
        >
          <div className={styles.mobileLeftPanel}>
            <AppSidebar collapsed={false} onToggleCollapse={left.close} />
          </div>
          <button
            type="button"
            className={styles.mobileLeftBackdrop}
            onClick={left.close}
            aria-label="Close sidebar"
          />
        </div>,
        portalRoot,
      )}

      {portalRoot && showRightMobileSheet && createPortal(
        <div
          className={styles.mobileRightOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Chat"
        >
          <button
            type="button"
            className={styles.mobileRightBackdrop}
            onClick={right.close}
            aria-label="Close chat"
          />
          <div className={styles.mobileRightSheet}>
            <div className={styles.mobileRightSheetHandle} />
            <div className={styles.mobileRightSheetContent}>
              <ChatContainer mode="sidebar" onClose={right.close} />
            </div>
          </div>
        </div>,
        portalRoot,
      )}

      {portalRoot && showFab && createPortal(
        <button
          type="button"
          className={styles.fab}
          onClick={right.open}
          aria-label="開啟 AI 助教"
        >
          <AiLaunch size={20} />
        </button>,
        portalRoot,
      )}
    </div>
  );
}
