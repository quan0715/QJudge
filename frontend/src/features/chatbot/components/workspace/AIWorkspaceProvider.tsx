import { createContext, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import AiLaunch from "@carbon/icons-react/es/AiLaunch.js";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import styles from "./WorkspaceShell.module.scss";

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
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function AIWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(getInitialOpen);

  const isAllowed = user?.role === "teacher" || user?.role === "admin";
  const isOnChatPage = location.pathname === "/chat";
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;

  const persistOpen = useCallback((open: boolean) => {
    setIsOpen(open);
    try { localStorage.setItem(STORAGE_KEY, String(open)); } catch { /* ignore */ }
  }, []);

  const openChat = useCallback(() => {
    if (!isAllowed) return;
    if (isMobile) {
      navigate("/chat");
      return;
    }
    persistOpen(true);
  }, [isAllowed, isMobile, navigate, persistOpen]);

  const closeChat = useCallback(() => {
    persistOpen(false);
  }, [persistOpen]);

  const toggleChat = useCallback(() => {
    if (!isAllowed) return;
    if (isMobile) {
      navigate("/chat");
      return;
    }
    persistOpen(!isOpen);
  }, [isAllowed, isMobile, navigate, persistOpen, isOpen]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({ isOpen: isOpen && isAllowed, isAllowed, openChat, closeChat, toggleChat }),
    [isOpen, isAllowed, openChat, closeChat, toggleChat],
  );

  const showFab = isAllowed && !isOpen && !isOnChatPage && !isMobile;

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
      {showFab &&
        createPortal(
          <button
            className={styles.fab}
            onClick={toggleChat}
            aria-label="開啟 AI 助教"
          >
            <AiLaunch size={20} />
          </button>,
          document.body,
        )}
    </WorkspaceContext.Provider>
  );
}
