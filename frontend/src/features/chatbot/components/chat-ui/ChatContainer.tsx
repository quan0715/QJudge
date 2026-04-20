import { useCallback, useEffect, useRef } from "react";
import { Loading } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { useChatbot } from "../../hooks/useChatbot";
import type { ChatContext, ChatMessage, ChatSession, ModelInfo } from "@/core/types/chatbot.types";
import { MessageList } from "./MessageList";
import { ComposerBar } from "./ComposerBar";
import { ChatTopBar } from "./ChatTopBar";
import {
  ArtifactPanelProvider,
  useArtifactPanel,
} from "@/features/chatbot/contexts/ArtifactPanelContext";
import { ArtifactPanel } from "../artifact/ArtifactPanel";
import { useWorkspace } from "@/features/app/contexts/WorkspaceContext";
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
    <ArtifactPanelProvider sessionId={currentSessionId}>
      <div className={`${styles.container} ${styles[mode]} ${className ?? ""}`}>
        <ChatContainerBody
          mode={mode}
          sessionTitle={sessionTitle}
          sessions={sessions}
          currentSessionId={currentSessionId}
          messages={messages}
          isSessionLoading={isSessionLoading}
          pendingApproval={pendingApproval}
          availableModels={availableModels}
          selectedModelId={selectedModelId}
          setSelectedModelId={setSelectedModelId}
          isStreaming={isStreaming}
          sessionNotice={sessionNotice}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          onRenameSession={renameSession}
          onDeleteSession={deleteSession}
          sendMessage={sendMessage}
          stopStreaming={stopStreaming}
          onApproval={handleApproval}
          onClose={onClose}
        />
      </div>
    </ArtifactPanelProvider>
  );
}

type UseChatbotReturn = ReturnType<typeof useChatbot>;

interface ChatContainerBodyProps {
  mode: "full" | "sidebar";
  sessionTitle: string;
  sessions: ChatSession[];
  currentSessionId: string | null;
  messages: ChatMessage[];
  isSessionLoading: boolean;
  pendingApproval: UseChatbotReturn["pendingApproval"];
  availableModels: ModelInfo[];
  selectedModelId: string;
  setSelectedModelId: (id: string) => void;
  isStreaming: boolean;
  sessionNotice: UseChatbotReturn["sessionNotice"];
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onRenameSession: (id: string, title: string) => void;
  onDeleteSession: (id: string) => void;
  sendMessage: UseChatbotReturn["sendMessage"];
  stopStreaming: () => void;
  onApproval: (decision: "approve" | "reject") => void;
  onClose?: () => void;
}

function ChatContainerBody({
  mode,
  sessionTitle,
  sessions,
  currentSessionId,
  messages,
  isSessionLoading,
  pendingApproval,
  availableModels,
  selectedModelId,
  setSelectedModelId,
  isStreaming,
  sessionNotice,
  onSelectSession,
  onNewChat,
  onRenameSession,
  onDeleteSession,
  sendMessage,
  stopStreaming,
  onApproval,
  onClose,
}: ChatContainerBodyProps) {
  const { isMobile } = useWorkspace();
  const { isOpen: artifactOpen, markToolFinished } = useArtifactPanel();
  const showSplitPanel = artifactOpen && !isMobile;
  const showBottomSheet = artifactOpen && isMobile;

  // Trigger artifact list refresh whenever an artifact_* tool call finishes.
  // Dedup by toolCallId so repeat messages don't re-fetch.
  const seenToolCalls = useRef<Set<string>>(new Set());
  useEffect(() => {
    seenToolCalls.current = new Set();
  }, [currentSessionId]);
  useEffect(() => {
    for (const message of messages) {
      const execs = message.toolExecutions ?? [];
      for (const step of execs) {
        if (!step.toolCallId || !step.toolName) continue;
        if (!step.toolName.startsWith("artifact_")) continue;
        if (step.result === undefined && !step.isError) continue;
        if (seenToolCalls.current.has(step.toolCallId)) continue;
        seenToolCalls.current.add(step.toolCallId);
        markToolFinished(step.toolName);
      }
    }
  }, [messages, markToolFinished]);

  return (
    <div className={styles.main}>
      <ChatTopBar
        mode="full"
        hideSidebarControl={mode === "sidebar"}
        title={sessionTitle}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={onSelectSession}
        onNewChat={onNewChat}
        onRenameSession={onRenameSession}
        onDeleteSession={onDeleteSession}
        onClose={onClose}
      />

      <div className={showSplitPanel ? styles.splitRow : styles.chatOnlyRow}>
        <div className={styles.chatBody}>
          <div className={styles.messagesArea}>
            <MessageList
              messages={messages}
              currentSessionId={currentSessionId}
              isLoading={isSessionLoading}
              pendingApproval={pendingApproval}
              onApprovalDecision={onApproval}
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
                messages={messages}
              />
            </div>
          </div>
        </div>

        {showSplitPanel && (
          <aside className={styles.artifactSplit}>
            <ArtifactPanel />
          </aside>
        )}
      </div>

      {showBottomSheet && (
        <div className={styles.bottomSheet} role="dialog">
          <ArtifactPanel />
        </div>
      )}
    </div>
  );
}
