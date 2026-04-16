import { useState, useCallback, useSyncExternalStore } from "react";
import { useChatbot } from "../../hooks/useChatbot";
import type { ChatContext } from "@/core/types/chatbot.types";
import { MessageList } from "./MessageList";
import { ComposerBar } from "./ComposerBar";
import { ChatHistoryPanel } from "./ChatHistoryPanel";
import { ChatTopBar } from "./ChatTopBar";
import styles from "./ChatContainer.module.scss";

// Reactive mobile detection via matchMedia
const MOBILE_QUERY = "(max-width: 768px)";
const subscribe = (cb: () => void) => {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
};
const getSnapshot = () => window.matchMedia(MOBILE_QUERY).matches;
const getServerSnapshot = () => false;

function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

interface ChatContainerProps {
  mode: "full" | "sidebar";
  context?: ChatContext | null;
  onProblemUpdated?: () => void;
  onClose?: () => void;
  className?: string;
}

export function ChatContainer({ mode, context, onProblemUpdated, onClose, className }: ChatContainerProps) {
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

  const isMobile = useIsMobile();
  const [historyOpen, setHistoryOpen] = useState(mode === "full" && !isMobile);

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
        {/* Mobile full-page header */}
        {showTopBar && (
          <ChatTopBar
            title={currentSession?.title || "QJudge AI 助教"}
            onToggleHistory={() => setHistoryOpen((v) => !v)}
            onNewChat={handleNewChat}
          />
        )}

        {/* Sidebar header with close button */}
        {mode === "sidebar" && onClose && (
          <ChatTopBar
            title="QJudge AI 助教"
            onClose={onClose}
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
