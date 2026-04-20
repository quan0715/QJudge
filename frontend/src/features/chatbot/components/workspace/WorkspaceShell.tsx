import { useCallback, useRef } from "react";
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

function getPortalRoot(): Element {
  if (typeof document === "undefined") return null as unknown as Element;
  return document.getElementById("modal-portal-root") ?? document.body;
}

/**
 * App-wide 3-panel shell：
 *
 * - 桌面：左 AppSidebar + 中（children）+ 右 ChatContainer
 * - 行動：中（children）為主；左以 portal drawer、右以 portal bottom-sheet 呈現
 *
 * 子節點（頁面）只負責 children 的內容；左右兩側固定由 Shell 內建組件提供。
 * 行為由 `useWorkspace()` 管理；頁面可呼叫 `useDisablePanel('right')` 等 hook
 * 宣告式地禁用面板（例如 `/chat` 主畫面、競賽進行中）。
 */
export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const { isMobile, left, right } = useWorkspace();

  // ── Layout decisions ──
  const dockLeft = !isMobile;                                       // desktop: left always in flow
  const showLeftMobileOverlay = isMobile && left.isOpen;            // mobile: portal drawer
  const dockRight = !isMobile && right.isOpen;                      // desktop: right docked
  const showRightMobileSheet = isMobile && right.isOpen;            // mobile: bottom sheet
  const showFab = right.isAllowed && !right.isOpen && !right.isDisabled;

  const panelRef = useRef<HTMLElement>(null);
  const dragging = useRef(false);

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

  return (
    <div className={styles.shell}>
      {dockLeft && (
        <aside className={`${styles.leftPanel} ${left.isOpen ? "" : styles.leftPanelCollapsed}`}>
          <AppSidebar collapsed={!left.isOpen} onToggleCollapse={left.close} />
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

      {showLeftMobileOverlay && typeof document !== "undefined" && createPortal(
        <div className={styles.mobileLeftOverlay}>
          <div className={styles.mobileLeftPanel}>
            <AppSidebar collapsed={false} onToggleCollapse={left.close} />
          </div>
          <div className={styles.mobileLeftBackdrop} onClick={left.close} aria-hidden="true" />
        </div>,
        getPortalRoot(),
      )}

      {showRightMobileSheet && typeof document !== "undefined" && createPortal(
        <div className={styles.mobileRightOverlay}>
          <div className={styles.mobileRightBackdrop} onClick={right.close} aria-hidden="true" />
          <div className={styles.mobileRightSheet}>
            <div className={styles.mobileRightSheetHandle} />
            <div className={styles.mobileRightSheetContent}>
              <ChatContainer mode="sidebar" onClose={right.close} />
            </div>
          </div>
        </div>,
        getPortalRoot(),
      )}

      {showFab && typeof document !== "undefined" && createPortal(
        <button
          type="button"
          className={styles.fab}
          onClick={right.open}
          aria-label="開啟 AI 助教"
        >
          <AiLaunch size={20} />
        </button>,
        document.body,
      )}
    </div>
  );
}
