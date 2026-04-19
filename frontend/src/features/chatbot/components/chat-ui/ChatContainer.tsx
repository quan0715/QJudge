import { useCallback } from "react";
import { Loading } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { useChatbot } from "../../hooks/useChatbot";
import type { ChatContext } from "@/core/types/chatbot.types";
import { MessageList } from "./MessageList";
import { ComposerBar } from "./ComposerBar";
import { ChatTopBar } from "./ChatTopBar";
import styles from "./ChatContainer.module.scss";

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

  const handleNewChat = useCallback(() => {
    createSession();
  }, [createSession]);

  const handleSelectSession = useCallback(
    (id: string) => {
      switchSession(id);
    },
    [switchSession],
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

  const sessionTitle = currentSession?.title || t("ui.newChat");

  return (
    <div className={`${styles.container} ${styles[mode]} ${className ?? ""}`}>
      {/* Main chat area */}
      <div className={styles.main}>
        <ChatTopBar
          mode="full"
          title={sessionTitle}
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          onRenameSession={renameSession}
          onDeleteSession={deleteSession}
          onClose={onClose}
        />

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
