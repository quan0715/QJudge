import { useState, useCallback, useSyncExternalStore } from "react";
import { Loading } from "@carbon/react";
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
        <div className={styles.loading}>
          <Loading withOverlay={false} description="載入中" />
        </div>
      </div>
    );
  }

  const showDesktopHistory = mode === "full" && !isMobile && historyOpen;
  // Mobile full-page or sidebar: history as overlay
  const showHistoryOverlay = (isMobile || mode === "sidebar") && historyOpen;

  const sessionTitle = currentSession?.title || "新對話";

  return (
    <div className={`${styles.container} ${styles[mode]} ${className ?? ""}`}>
      {/* Desktop full-page: history as side column */}
      {mode === "full" && !isMobile && (
        <div className={`${styles.historyColumn} ${showDesktopHistory ? "" : styles.historyCollapsed}`}>
          <ChatHistoryPanel
            sessions={sessions}
            currentSessionId={currentSessionId}
            onSelectSession={handleSelectSession}
            onDeleteSession={deleteSession}
            onRenameSession={renameSession}
          />
        </div>
      )}

      {/* Mobile / sidebar: history as overlay with slide animation */}
      <div className={`${styles.historyOverlay} ${showHistoryOverlay ? styles.historyOverlayOpen : ""}`}>
        <ChatHistoryPanel
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelectSession={handleSelectSession}
          onDeleteSession={deleteSession}
          onRenameSession={renameSession}
          onClose={() => setHistoryOpen(false)}
        />
      </div>

      {/* Main chat area */}
      <div className={styles.main}>
        {/* Unified top bar for full mode (desktop + mobile) */}
        {mode === "full" && (
          <ChatTopBar
            title={sessionTitle}
            historyOpen={historyOpen}
            onToggleHistory={() => setHistoryOpen((v) => !v)}
            onNewChat={handleNewChat}
          />
        )}

        {/* Sidebar header with history toggle + close */}
        {mode === "sidebar" && (
          <ChatTopBar
            title="QJudge AI 助教"
            historyOpen={historyOpen}
            onToggleHistory={() => setHistoryOpen((v) => !v)}
            onNewChat={handleNewChat}
            onClose={onClose}
          />
        )}

        <div className={styles.chatBody}>
          <div className={styles.messagesArea}>
            <MessageList
              messages={messages}
              pendingApproval={pendingApproval}
              onApprovalDecision={handleApproval}
            />
            <div className={styles.composerFloat}>
              <ComposerBar
                onSend={sendMessage}
                onStop={stopStreaming}
                isStreaming={isStreaming}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
