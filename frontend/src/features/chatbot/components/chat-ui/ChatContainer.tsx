import { useCallback, useMemo } from "react";
import { Loading } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useChatbotContext } from "../../contexts/ChatbotProvider";
import { useAiSessionParam } from "../../lib/aiSessionUrl";
import type { ChatMessage, ChatSession, ModelInfo } from "@/core/types/chatbot.types";
import { MessageList } from "./MessageList";
import { MessageBubble } from "./MessageBubble";
import { HITLCard } from "./HITLCard";
import { QuestionCard } from "./QuestionCard";
import { NextTurnChips } from "./NextTurnChips";
import { ComposerBar } from "./ComposerBar";
import { ChatTopBar } from "./ChatTopBar";
import { useArtifactPanel } from "@/features/chatbot/contexts/ArtifactPanelContext";
import { ArtifactPanel } from "../artifact/ArtifactPanel";
import { useWorkspace } from "@/features/app/contexts/WorkspaceContext";
import { CopilotEmbedShell } from "@copilot";
import {
  mapChatApprovalToCopilot,
  mapChatMessageToCopilot,
} from "@/infrastructure/copilot/chatbotCopilotMapper";
import styles from "./ChatContainer.module.scss";

interface ChatContainerProps {
  mode: "full" | "sidebar";
  onClose?: () => void;
  className?: string;
}

export function ChatContainer({ mode, onClose, className }: ChatContainerProps) {
  const { t } = useTranslation("chatbot");
  const {
    sessions,
    currentSessionId,
    currentSession,
    isStreaming,
    isInitializing,
    isSessionLoading,
    pendingApproval,
    pendingQuestion,
    nextTurnOptions,
    sessionNotice,
    availableModels,
    selectedModelId,
    setSelectedModelId,
    createSession,
    deleteSession,
    renameSession,
    sendMessage,
    stopStreaming,
    submitApproval,
    submitAnswer,
  } = useChatbotContext();

  const handleNewChat = useCallback(() => {
    createSession();
  }, [createSession]);

  const { setAiSessionId } = useAiSessionParam();
  const handleSelectSession = useCallback(
    (id: string) => {
      setAiSessionId(id);
    },
    [setAiSessionId],
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
      <CopilotEmbedShell showHeader={false} showHistory={false} className={className}>
      <div className={`${styles.container} ${styles[mode]}`}>
        <div className={styles.loading}>
          <Loading withOverlay={false} description={t("ui.loading")} />
        </div>
      </div>
      </CopilotEmbedShell>
    );
  }

  const sessionTitle = currentSession?.title || t("ui.newChat");

  return (
    <CopilotEmbedShell showHeader={false} showHistory={false} className={className}>
    <div className={`${styles.container} ${styles[mode]}`}>
      <ChatContainerBody
        mode={mode}
        sessionTitle={sessionTitle}
        sessions={sessions}
        currentSessionId={currentSessionId}
        messages={messages}
        isSessionLoading={isSessionLoading}
        pendingApproval={pendingApproval}
        pendingQuestion={pendingQuestion}
        nextTurnOptions={nextTurnOptions}
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
        submitAnswer={submitAnswer}
        onClose={onClose}
      />
    </div>
    </CopilotEmbedShell>
  );
}

type UseChatbotReturn = ReturnType<typeof useChatbotContext>;

interface ChatContainerBodyProps {
  mode: "full" | "sidebar";
  sessionTitle: string;
  sessions: ChatSession[];
  currentSessionId: string | null;
  messages: ChatMessage[];
  isSessionLoading: boolean;
  pendingApproval: UseChatbotReturn["pendingApproval"];
  pendingQuestion: UseChatbotReturn["pendingQuestion"];
  nextTurnOptions: UseChatbotReturn["nextTurnOptions"];
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
  submitAnswer: UseChatbotReturn["submitAnswer"];
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
  pendingQuestion,
  nextTurnOptions,
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
  submitAnswer,
  onClose,
}: ChatContainerBodyProps) {
  const { isMobile } = useWorkspace();
  const { isOpen: artifactOpen, markToolFinished } = useArtifactPanel();
  const showSplitPanel = artifactOpen && !isMobile;
  const showBottomSheet = artifactOpen && isMobile;

  // 重要：原本掃描 messages→artifact_* tool call→markToolFinished 的 effect 已搬至
  // `ArtifactPanelProvider`。ChatContainer 只在右側 panel 開著時才 mount，AI Grading
  // 等只看 artifacts（進度/grade.csv）而關閉 chat panel 的場景會丟失 refresh 觸發。
  // Pending composer files are uploaded inside sendMessage after the backend
  // session is guaranteed to exist; nudge the artifact panel after that flow.
  const handleSend = useCallback(async (text: string, pendingFiles: File[] = []) => {
    const didSend = await sendMessage(text, pendingFiles);
    if (didSend && pendingFiles.length > 0) {
      markToolFinished("artifact_write");
    }
    return didSend;
  }, [markToolFinished, sendMessage]);

  // Transitional legacy-shell seam. Public renderers stay package-shaped;
  // legacy data is normalized only at this legacy container boundary.
  const copilotMessages = useMemo(
    () => messages.map(mapChatMessageToCopilot),
    [messages],
  );
  const copilotApproval = useMemo(
    () => pendingApproval ? mapChatApprovalToCopilot(pendingApproval) : null,
    [pendingApproval],
  );
  const copilotQuestion = useMemo(
    () => pendingQuestion ? {
      question: pendingQuestion.question,
      input: pendingQuestion.inputType === "choice" ? "choice" as const : "text" as const,
      options: pendingQuestion.options,
    } : null,
    [pendingQuestion],
  );
  const activeSession = useMemo(() => {
    if (isSessionLoading) {
      return {
        status: "loading" as const,
        id: currentSessionId ?? "__pending__",
        data: null,
        error: null,
      };
    }
    if (!currentSessionId) {
      return { status: "empty" as const, id: null, data: null, error: null };
    }
    const createdAt = copilotMessages[0]?.createdAt ?? new Date(0);
    const updatedAt = copilotMessages.at(-1)?.createdAt ?? createdAt;
    return {
      status: "ready" as const,
      id: currentSessionId,
      data: {
        id: currentSessionId,
        title: sessionTitle,
        createdAt,
        updatedAt,
        messages: copilotMessages,
      },
      error: null,
    };
  }, [copilotMessages, currentSessionId, isSessionLoading, sessionTitle]);

  const chatMain = (
    <div className={styles.chatBody}>
      <div className={styles.messagesArea}>
        <MessageList
          messages={copilotMessages}
          activeSessionId={currentSessionId}
          activeSession={activeSession}
          run={{ status: "ready", run: null }}
          messageComponent={MessageBubble}
        />
        {copilotApproval && (
          <HITLCard request={copilotApproval} onSubmit={onApproval} />
        )}
        {copilotQuestion && (
          <QuestionCard request={copilotQuestion} onSubmit={submitAnswer} />
        )}
        {!isStreaming && !copilotApproval && !copilotQuestion && nextTurnOptions?.length ? (
          <NextTurnChips options={nextTurnOptions} onSelect={sendMessage} />
        ) : null}
        <div className={styles.composerFloat}>
          <ComposerBar
            onSend={handleSend}
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
  );

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

      {showSplitPanel ? (
        <Group
          orientation="horizontal"
          className={styles.splitPanels}
        >
          <Panel id="chat-panel" defaultSize={62} minSize="420px">
            {chatMain}
          </Panel>
          <Separator className={styles.resizeHandle} />
          <Panel id="artifact-panel" defaultSize={38} minSize="320px">
            <aside className={styles.artifactSplit}>
              <ArtifactPanel />
            </aside>
          </Panel>
        </Group>
      ) : (
        <div className={styles.chatOnlyRow}>
          {chatMain}
        </div>
      )}

      {showBottomSheet && (
        <div className={styles.bottomSheet} role="dialog">
          <ArtifactPanel />
        </div>
      )}
    </div>
  );
}
