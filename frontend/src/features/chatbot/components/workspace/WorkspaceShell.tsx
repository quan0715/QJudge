import { useRef, useCallback } from "react";
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
  children: React.ReactNode;
}

export function WorkspaceShell({ children }: WorkspaceShellProps) {
  const { isOpen, closeChat } = useWorkspace();
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
      <div className={styles.content}>
        {children}
      </div>
      <aside
        ref={panelRef}
        className={`${styles.panel} ${isOpen ? styles.panelOpen : ""}`}
        style={isOpen ? { width: getSavedWidth() } : undefined}
      >
        {isOpen && (
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
