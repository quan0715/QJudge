import { createContext, useState, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import AiLaunch from "@carbon/icons-react/es/AiLaunch.js";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { ChatContainer } from "../chat-ui/ChatContainer";
import styles from "./AIWorkspaceProvider.module.scss";
import shellStyles from "./WorkspaceShell.module.scss";

const STORAGE_KEY = "workspace_chat_open";

export interface WorkspaceContextValue {
  isOpen: boolean;
  isAllowed: boolean;
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue>({
  isOpen: false,
  isAllowed: false,
  openChat: () => {},
  closeChat: () => {},
  toggleChat: () => {},
});

function getInitialOpen(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === "true"; }
  catch { return false; }
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= 768,
  );
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 768px)");
    const handle = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handle);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener("change", handle);
  }, []);
  return isMobile;
}

export function AIWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(getInitialOpen);
  const isMobile = useIsMobile();

  const isAllowed = user?.role === "teacher" || user?.role === "admin";
  const isOnChatPage = location.pathname.startsWith("/chat");

  const persistOpen = useCallback((open: boolean) => {
    setIsOpen(open);
    try { localStorage.setItem(STORAGE_KEY, String(open)); } catch { /* ignore */ }
  }, []);

  const openChat = useCallback(() => {
    if (!isAllowed) return;
    persistOpen(true);
  }, [isAllowed, persistOpen]);

  const closeChat = useCallback(() => {
    persistOpen(false);
  }, [persistOpen]);

  const toggleChat = useCallback(() => {
    if (!isAllowed) return;
    persistOpen(!isOpen);
  }, [isAllowed, persistOpen, isOpen]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({ isOpen: isOpen && isAllowed, isAllowed, openChat, closeChat, toggleChat }),
    [isOpen, isAllowed, openChat, closeChat, toggleChat],
  );

  // FAB: desktop only — on mobile the panel is hidden so FAB is not needed
  const showFab = isAllowed && !isOpen && !isOnChatPage && !isMobile;

  // Mobile bottom-sheet: replaces the side panel on mobile
  const showMobileSheet = isAllowed && isOpen && isMobile && !isOnChatPage;

  return (
    <WorkspaceContext.Provider value={value}>
      {children}

      {showFab && typeof document !== "undefined" && createPortal(
        <button
          className={shellStyles.fab}
          onClick={openChat}
          aria-label="開啟 AI 助教"
        >
          <AiLaunch size={20} />
        </button>,
        document.body,
      )}

      {showMobileSheet && typeof document !== "undefined" && createPortal(
        <div className={styles.overlay}>
          <div className={styles.backdrop} onClick={closeChat} aria-hidden="true" />
          <div className={styles.sheet}>
            <div className={styles.sheetHandle} />
            <div className={styles.sheetContent}>
              <ChatContainer
                mode="sidebar"
                onClose={closeChat}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </WorkspaceContext.Provider>
  );
}
