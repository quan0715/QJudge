import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import AiLaunch from "@carbon/icons-react/es/AiLaunch.js";
import { AppSidebar } from "@/features/app/components/AppSidebar";
import { WorkspaceTopNav } from "@/features/app/components/workspace/WorkspaceTopNav";
import { useWorkspace } from "@/features/app/contexts/WorkspaceContext";
import { WorkspaceToolbarSlotProvider } from "@/features/app/contexts/WorkspaceToolbarSlot";
import { ChatContainer } from "../chat-ui/ChatContainer";
import {
  WorkspaceBackdrop,
  WorkspaceDraggableSheet,
  WorkspaceOverlayRoot,
  WorkspacePanelPresence,
  WorkspaceSlideInLeftPanel,
} from "./WorkspacePanelMotion";
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
 * Top nav 由 Shell 統一提供；mobile sidebar 入口也在 top nav 內，
 * 避免頁面自行 toolbar 與 Shell chrome 出現重複控制。
 *
 * 行為由 `useWorkspace()` 管理；頁面可呼叫 `useDisablePanel('right')` 等 hook
 * 宣告式禁用面板（例如 `/chat` 主畫面、競賽進行中）。
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
  const isLeftCollapsed = !left.isOpen;

  // Auto-close the mobile drawer on navigation — otherwise the drawer's
  // global open state persists and covers the newly-loaded page.
  const location = useLocation();
  const prevPathname = useRef(location.pathname);
  useEffect(() => {
    if (prevPathname.current === location.pathname) return;
    prevPathname.current = location.pathname;
    if (isMobile && left.isOpen) left.close();
  }, [location.pathname, isMobile, left]);

  // 行動 sheet 開啟時鎖 body scroll，避免下拉/觸控滾到背景頁（dashboard 上的
  // 教室列表等）。`overscroll-behavior: contain` 在 sheet 內部 CSS 處理。
  useEffect(() => {
    if (!showLeftMobileOverlay && !showRightMobileSheet) return;
    const prevOverflow = document.body.style.overflow;
    const prevTouch = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouch;
    };
  }, [showLeftMobileOverlay, showRightMobileSheet]);

  // 用 visualViewport 同步 overlay 大小與 offsetTop。iOS Safari 上
  // `position: fixed` 釘在 layout viewport，鍵盤打開後 layout viewport 不縮，
  // sheet 會被推出可視區（toolbar 消失）。讀 visualViewport 後直接寫到 inline
  // style，鍵盤升降時 sheet 永遠貼齊可見區。
  const [vvStyle, setVvStyle] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    if (!showRightMobileSheet && !showLeftMobileOverlay) {
      setVvStyle(null);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setVvStyle({ height: vv.height, top: vv.offsetTop });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [showLeftMobileOverlay, showRightMobileSheet]);

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
      {leftEnabled ? (
        <WorkspaceTopNav showSidebarControl={isMobile} />
      ) : null}

      <div className={styles.bodyRow}>
        {dockLeft && (
          <aside className={[
            styles.leftPanel,
            isLeftCollapsed ? styles.leftPanelCollapsed : "",
          ].filter(Boolean).join(" ")}>
            <AppSidebar
              collapsed={isLeftCollapsed}
              compact={isLeftCollapsed}
              onToggleCollapse={left.toggle}
            />
          </aside>
        )}

        <div className={styles.mainColumn}>
          <WorkspaceToolbarSlotProvider>
            <MainColumnBody chatOpen={right.isOpen}>
              {children}
            </MainColumnBody>
          </WorkspaceToolbarSlotProvider>
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
      </div>

      {portalRoot && createPortal(
        <WorkspacePanelPresence show={showLeftMobileOverlay}>
          <WorkspaceOverlayRoot
            className={styles.mobileLeftOverlay}
            ariaLabel="App sidebar"
            style={vvStyle ? { height: vvStyle.height, top: vvStyle.top } : undefined}
          >
            <WorkspaceSlideInLeftPanel className={styles.mobileLeftPanel}>
              <AppSidebar collapsed={false} onToggleCollapse={left.close} />
            </WorkspaceSlideInLeftPanel>
            <WorkspaceBackdrop
              className={styles.mobileLeftBackdrop}
              onClick={left.close}
              ariaLabel="Close sidebar"
            />
          </WorkspaceOverlayRoot>
        </WorkspacePanelPresence>,
        portalRoot,
      )}

      {portalRoot && createPortal(
        <WorkspacePanelPresence show={showRightMobileSheet}>
          <WorkspaceOverlayRoot
            className={styles.mobileRightOverlay}
            ariaLabel="Chat"
            style={vvStyle ? { height: vvStyle.height, top: vvStyle.top } : undefined}
          >
            <WorkspaceBackdrop
              className={styles.mobileRightBackdrop}
              onClick={right.close}
              ariaLabel="Close chat"
            />
            <WorkspaceDraggableSheet
              className={styles.mobileRightSheet}
              handleClassName={styles.mobileRightSheetHandle}
              onClose={right.close}
            >
              <div className={styles.mobileRightSheetContent}>
                <ChatContainer mode="sidebar" onClose={right.close} />
              </div>
            </WorkspaceDraggableSheet>
          </WorkspaceOverlayRoot>
        </WorkspacePanelPresence>,
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

/**
 * Main column content owns the scrollable application surface below Shell chrome.
 */
function MainColumnBody({
  children,
  chatOpen,
}: {
  children: React.ReactNode;
  chatOpen: boolean;
}) {
  return (
    <div
      className={styles.content}
      data-chatbot-sidebar-open={chatOpen ? "true" : "false"}
    >
      {children}
    </div>
  );
}
