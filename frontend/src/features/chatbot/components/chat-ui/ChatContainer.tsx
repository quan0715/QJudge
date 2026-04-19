import { useState, useCallback, useSyncExternalStore } from "react";
import { Loading } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { useChatbot } from "../../hooks/useChatbot";
import type { ChatContext } from "@/core/types/chatbot.types";
import { MessageList } from "./MessageList";
import { ComposerBar } from "./ComposerBar";
import { ChatHistoryPanel } from "./ChatHistoryPanel";
import { ChatTopBar } from "./ChatTopBar";
import styles from "./ChatContainer.module.scss";

// Reactive mobile detection — sync with $chat-mobile-breakpoint in _variables.scss
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
  /** full-page 模式：當前 URL session ID */
  externalSessionId?: string;
  /** full-page 模式：session 建立/切換後的導航回調 */
  onSessionChange?: (newId: string) => void;
  /** full-page 模式：session 刪除後的導航回調 */
  onSessionDeleted?: (fallbackId: string | null) => void;
}

export function ChatContainer({ mode, context, onProblemUpdated, onClose, className, externalSessionId, onSessionChange, onSessionDeleted }: ChatContainerProps) {
  const { t } = useTranslation("chatbot");
  const {
    sessions,
    currentSessionId,
    currentSession,
    isStreaming,
    isInitializing,
    isSessionLoading,
    pendingApproval,
    sessionNotice,
    availableModels,
    selectedModelId,
    setSelectedModelId,
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
    externalSessionId: mode === "full" ? externalSessionId : undefined,
    onSessionChange: mode === "full" ? onSessionChange : undefined,
    onSessionDeleted: mode === "full" ? onSessionDeleted : undefined,
  });

  const isMobile = useIsMobile();
  const [historyOpen, setHistoryOpen] = useState(mode === "sidebar");

  const handleNewChat = useCallback(() => {
    createSession();
    if (isMobile) setHistoryOpen(false);
  }, [createSession, isMobile]);

  const handleSelectSession = useCallback(
    (id: string) => {
      switchSession(id);
      if (isMobile || mode === "sidebar") setHistoryOpen(false);
    },
    [switchSession, isMobile, mode],
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
          <Loading withOverlay={false} description={t("ui.loading")} />
        </div>
      </div>
    );
  }

  // Mobile full-page or sidebar: history as overlay
  const showHistoryOverlay = mode === "sidebar" && historyOpen;

  const sessionTitle = currentSession?.title || t("ui.newChat");

  return (
    <div className={`${styles.container} ${styles[mode]} ${className ?? ""}`}>
      {/* Sidebar: history as overlay with slide animation */}
      {mode === "sidebar" && (
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
      )}

      {/* Main chat area */}
      <div className={styles.main}>
        {/* Unified top bar for full mode (desktop + mobile) */}
        {mode === "full" && (
          <ChatTopBar
            mode="full"
            title={sessionTitle}
            sessions={sessions}
            currentSessionId={currentSessionId}
            onSelectSession={handleSelectSession}
            onNewChat={handleNewChat}
            onRenameSession={renameSession}
            onDeleteSession={deleteSession}
          />
        )}

        {/* Sidebar header with history toggle + close */}
        {mode === "sidebar" && (
          <ChatTopBar
            mode="sidebar"
            title={t("ui.chatbotTitle")}
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
              currentSessionId={currentSessionId}
              isLoading={isSessionLoading}
              pendingApproval={pendingApproval}
              onApprovalDecision={handleApproval}
            />
            <div className={styles.composerFloat}>
              <ComposerBar
                onSend={sendMessage}
                onStop={stopStreaming}
                isStreaming={isStreaming}
                sessionNotice={sessionNotice}
                models={availableModels}
                selectedModelId={selectedModelId}
                onModelChange={setSelectedModelId}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
