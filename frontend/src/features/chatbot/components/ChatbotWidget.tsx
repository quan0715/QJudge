// frontend/src/features/chatbot/components/ChatbotWidget.tsx
/**
 * ChatbotWidget — Split-view sidebar, teacher/admin only.
 * Uses the custom ChatContainer in sidebar mode.
 */
import { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import AiLaunch from "@carbon/icons-react/es/AiLaunch.js";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { ChatContainer } from "./chat-ui/ChatContainer";
import styles from "./ChatbotSidePanel.module.scss";

export interface ChatbotWidgetProps {
  defaultExpanded?: boolean;
  onProblemUpdated?: () => void;
}

export const ChatbotWidget = ({
  defaultExpanded = false,
  onProblemUpdated,
}: ChatbotWidgetProps) => {
  const { user } = useAuth();
  const location = useLocation();
  const isOnChatPage = location.pathname === "/chat";
  const [sideBarOpen, setSideBarOpen] = useState(defaultExpanded);

  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "admin";

  const handleToggle = useCallback(() => {
    setSideBarOpen((prev) => !prev);
  }, []);

  const handleClose = useCallback(() => {
    setSideBarOpen(false);
  }, []);

  if (!isTeacherOrAdmin || isOnChatPage) return null;

  let className = styles.sidebar;
  if (!sideBarOpen) className += ` ${styles.sidebarClosed}`;

  return (
    <>
      {/* Toggle FAB — only when closed */}
      {!sideBarOpen &&
        createPortal(
          <button
            className={styles.toggleButton}
            onClick={handleToggle}
            aria-label="開啟 AI 助教"
          >
            <AiLaunch size={20} />
          </button>,
          document.body,
        )}

      {/* Sidebar panel */}
      <div className={className}>
        {sideBarOpen && (
          <ChatContainer
            mode="sidebar"
            onProblemUpdated={onProblemUpdated}
            onClose={handleClose}
            className={styles.chatElement}
          />
        )}
      </div>
    </>
  );
};

export default ChatbotWidget;
