import type { FC } from "react";
import { useState, useCallback } from "react";
import { Loading } from "@carbon/react";
import type { BackgroundInformation } from "@/core/types/chatbot.types";
import { AgentAvatar } from "@/shared/ui/chatbot/components/AgentAvatar";
import { ChatWindow } from "@/shared/ui/chatbot/components/ChatWindow";
import { useChatbot } from "../hooks/useChatbot";
import styles from "@/shared/ui/chatbot/ChatbotWidget.module.scss";

export interface ChatbotWidgetProps {
  /** 預設是否展開 */
  defaultExpanded?: boolean;
  /** 題目上下文資訊（用於顯示在 UI） */
  problemContext?: {
    id: number | string;
    title: string;
  } | null;
  /** 背景資訊（用於第一則訊息） */
  backgroundInfo?: BackgroundInformation | null;
}

/**
 * Chatbot 側邊面板元件
 * 右側可收合的聊天面板，支援多 session 管理
 */
export const ChatbotWidget: FC<ChatbotWidgetProps> = ({
  defaultExpanded = true,
  problemContext = null,
  backgroundInfo = null,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  // 追蹤是否曾經展開過，用於延遲初始化（一旦展開過就永遠為 true）
  const [hasBeenExpanded, setHasBeenExpanded] = useState(defaultExpanded);

  // 只有在曾經展開過時才啟用 chatbot
  const {
    sessions,
    currentSession,
    isLoading,
    isStreaming,
    isInitializing,
    error,
    pendingUserInput,
    createSession,
    switchSession,
    deleteSession,
    renameSession,
    sendMessage,
    submitUserInput,
    cancelUserInput,
    clearError,
  } = useChatbot({ enabled: hasBeenExpanded, backgroundInfo });

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => {
      const newValue = !prev;
      // 首次展開時啟用 chatbot 初始化
      if (newValue && !hasBeenExpanded) {
        setHasBeenExpanded(true);
      }
      return newValue;
    });
  }, [hasBeenExpanded]);

  return (
    <>
      {/* 收合狀態的按鈕 */}
      {!isExpanded && (
        <button
          className={styles.collapsedButton}
          onClick={handleToggle}
          aria-label="展開 Qgent TA"
          title="展開 Qgent TA"
        >
          <AgentAvatar size="md" />
        </button>
      )}

      {/* 展開的聊天面板 */}
      {isExpanded && (
        <div className={styles.chatbotPanel}>
          {isInitializing ? (
            <div className={styles.loadingContainer}>
              <Loading withOverlay={false} small />
              <span>載入中...</span>
            </div>
          ) : (
            <ChatWindow
              sessions={sessions}
              currentSession={currentSession}
              isLoading={isLoading}
              isStreaming={isStreaming}
              error={error}
              onSend={sendMessage}
              onCreateSession={createSession}
              onSwitchSession={switchSession}
              onDeleteSession={deleteSession}
              onRenameSession={renameSession}
              onCollapse={handleToggle}
              onClearError={clearError}
              problemContext={problemContext}
              backgroundInfo={backgroundInfo}
              pendingUserInput={pendingUserInput}
              onSubmitUserInput={submitUserInput}
              onCancelUserInput={cancelUserInput}
            />
          )}
        </div>
      )}
    </>
  );
};

export default ChatbotWidget;
