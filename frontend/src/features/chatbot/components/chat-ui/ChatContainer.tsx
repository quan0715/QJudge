import { useState, useCallback } from "react";
import { useChatbot } from "../../hooks/useChatbot";
import type { ChatContext } from "@/core/types/chatbot.types";
import { MessageList } from "./MessageList";
import { ComposerBar } from "./ComposerBar";
import { ChatHistoryPanel } from "./ChatHistoryPanel";
import { ChatTopBar } from "./ChatTopBar";
import styles from "./ChatContainer.module.scss";

interface ChatContainerProps {
  mode: "full" | "sidebar";
  context?: ChatContext | null;
  onProblemUpdated?: () => void;
  className?: string;
}

export function ChatContainer({ mode, context, onProblemUpdated, className }: ChatContainerProps) {
  const {
    sessions,
    currentSessionId,
    currentSession,
    isStreaming,
    isInitializing,
    pendingApproval,
    createSession,
    deleteSession,
    switchSession,
    renameSession,
    sendMessage,
    stopStreaming,
    submitApproval,
  } = useChatbot({
    enabled: true,
    context,
    onProblemUpdated,
  });

  const [historyOpen, setHistoryOpen] = useState(mode === "full");
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;

  const handleNewChat = useCallback(() => {
    createSession();
    if (isMobile) setHistoryOpen(false);
  }, [createSession, isMobile]);

  const handleSelectSession = useCallback(
    (id: string) => {
      switchSession(id);
      if (isMobile) setHistoryOpen(false);
    },
    [switchSession, isMobile],
  );

  const handleApproval = useCallback(
    (decision: "approve" | "reject") => {
      submitApproval(decision);
    },
    [submitApproval],
  );

  const messages = currentSession?.messages ?? [];

  if (isInitializing) {
    return (
      <div className={`${styles.container} ${styles[mode]} ${className ?? ""}`}>
        <div className={styles.loading}>載入中…</div>
      </div>
    );
  }

  const showDesktopHistory = mode === "full" && !isMobile && historyOpen;
  const showMobileHistory = isMobile && historyOpen;
  const showTopBar = mode === "full" && isMobile;

  return (
    <div className={`${styles.container} ${styles[mode]} ${className ?? ""}`}>
      {/* Desktop history panel */}
      {mode === "full" && !isMobile && (
        <div className={`${styles.historyColumn} ${showDesktopHistory ? "" : styles.historyCollapsed}`}>
          <ChatHistoryPanel
            sessions={sessions}
            currentSessionId={currentSessionId}
            onSelectSession={handleSelectSession}
            onNewChat={handleNewChat}
            onDeleteSession={deleteSession}
            onRenameSession={renameSession}
            onClose={() => setHistoryOpen(false)}
            showCloseButton
          />
        </div>
      )}

      {/* Mobile history overlay */}
      {showMobileHistory && (
        <div className={styles.mobileHistoryOverlay}>
          <ChatHistoryPanel
            sessions={sessions}
            currentSessionId={currentSessionId}
            onSelectSession={handleSelectSession}
            onNewChat={handleNewChat}
            onDeleteSession={deleteSession}
            onRenameSession={renameSession}
            onClose={() => setHistoryOpen(false)}
            showCloseButton
          />
        </div>
      )}

      {/* Main chat area */}
      <div className={styles.main}>
        {showTopBar && (
          <ChatTopBar
            title={currentSession?.title || "QJudge AI 助教"}
            onToggleHistory={() => setHistoryOpen((v) => !v)}
            onNewChat={handleNewChat}
          />
        )}

        <div className={styles.messagesArea}>
          <MessageList
            messages={messages}
            pendingApproval={pendingApproval}
            onApprovalDecision={handleApproval}
          />
        </div>

        <ComposerBar
          onSend={sendMessage}
          onStop={stopStreaming}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}
