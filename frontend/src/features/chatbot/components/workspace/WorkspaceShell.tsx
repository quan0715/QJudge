import { useRef, useCallback } from "react";
import { IconButton } from "@carbon/react";
import { SidePanelOpen } from "@carbon/icons-react";
import { useWorkspace } from "../../hooks/useWorkspace";
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

interface WorkspaceShellProps {
  /** Main workspace area. */
  children: React.ReactNode;
  /** Persistent left panel (e.g. AppSidebar). */
  leftPanel?: React.ReactNode;
  /** When true, left panel is hidden (width: 0). */
  leftPanelCollapsed?: boolean;
  /** Callback to expand the left panel; also triggers the expand button in content area. */
  onExpandLeftPanel?: () => void;
  /**
   * When true, the right chat panel is suppressed entirely (hidden + no resize handle).
   * Use on pages that already embed chat (e.g. /chat full-page).
   */
  disableRightPanel?: boolean;
}

/**
 * Two-column shell: main content + optional chat panel.
 *
 * **Chat open state for descendants**
 * - Any child may call `useWorkspace()` and read `isOpen` / `toggleChat` / etc.
 * - The main content wrapper also sets `data-chatbot-sidebar-open` for CSS or
 *   non-React consumers (`[data-chatbot-sidebar-open="true"]`).
 */
export function WorkspaceShell({ children, leftPanel, leftPanelCollapsed = false, onExpandLeftPanel, disableRightPanel = false }: WorkspaceShellProps) {
  const { isOpen, closeChat } = useWorkspace();
  const rightPanelOpen = isOpen && !disableRightPanel;
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
      {leftPanel && (
        <aside
          className={`${styles.leftPanel} ${leftPanelCollapsed ? styles.leftPanelCollapsed : ""}`}
        >
          {leftPanel}
        </aside>
      )}
      <div
        className={`${styles.content} ${
          leftPanelCollapsed && onExpandLeftPanel ? styles.contentWithExpandControl : ""
        }`}
        data-chatbot-sidebar-open={rightPanelOpen ? "true" : "false"}
      >
        {leftPanelCollapsed && onExpandLeftPanel && (
          <div className={styles.expandLeftPanelBtn}>
            <IconButton
              kind="ghost"
              size="sm"
              label="展開側欄"
              align="right"
              onClick={onExpandLeftPanel}
            >
              <SidePanelOpen size={16} />
            </IconButton>
          </div>
        )}
        {children}
      </div>
      <aside
        ref={panelRef}
        className={`${styles.panel} ${rightPanelOpen ? styles.panelOpen : ""}`}
        style={rightPanelOpen ? { width: getSavedWidth() } : undefined}
      >
        {rightPanelOpen && (
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
              <ChatContainer
                mode="sidebar"
                onClose={closeChat}
              />
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
