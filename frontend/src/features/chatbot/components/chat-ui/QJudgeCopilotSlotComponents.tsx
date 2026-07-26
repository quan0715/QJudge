import { useContext } from "react";
import { InlineNotification } from "@carbon/react";
import { useTranslation } from "react-i18next";

import {
  useCopilotComposer,
  useCopilotModels,
  useCopilotRun,
  useCopilotSessions,
  type CopilotEmptyStateProps,
  type CopilotErrorStateProps,
  type CopilotHeaderProps,
  type CopilotHistorySlotProps,
} from "@copilot";

import { ChatHistoryPanel } from "./ChatHistoryPanel";
import { ChatTopBar } from "./ChatTopBar";
import { ComposerBar } from "./ComposerBar";
import { MessageBubble } from "./MessageBubble";
import { MessageList } from "./MessageList";
import { QJudgeChatPresentationContext } from "./qJudgeChatPresentationContext";

export function QJudgeCopilotHeader({
  activeSession,
  onNewSession,
}: CopilotHeaderProps) {
  const sessions = useCopilotSessions();
  const { mode, onClose } = useContext(QJudgeChatPresentationContext);
  const title = activeSession.data?.title;

  return (
    <ChatTopBar
      mode="full"
      hideSidebarControl={mode === "sidebar"}
      loading={
        activeSession.status === "initializing" ||
        activeSession.status === "loading"
      }
      title={title}
      sessions={sessions.sessions}
      currentSessionId={sessions.activeSession.id}
      onSelectSession={(id) => void sessions.select(id)}
      onNewChat={onNewSession}
      onRenameSession={(id, nextTitle) => void sessions.rename(id, nextTitle)}
      onDeleteSession={(id) => void sessions.remove(id)}
      onClose={onClose}
    />
  );
}

export function QJudgeCopilotHistory({
  sessions,
  activeSession,
  onSelect,
  onCreate,
  onRename,
  onRemove,
}: CopilotHistorySlotProps) {
  return (
    <ChatHistoryPanel
      sessions={sessions}
      currentSessionId={activeSession.id}
      onSelectSession={onSelect}
      onNewTask={onCreate}
      onRenameSession={onRename}
      onDeleteSession={onRemove}
    />
  );
}

export function QJudgeCopilotComposer() {
  const composer = useCopilotComposer();
  const run = useCopilotRun();
  const models = useCopilotModels();
  const sessions = useCopilotSessions();
  const isStreaming =
    run.state.status === "submitted" || run.state.status === "streaming";
  const isAwaitingHumanInput =
    run.state.status === "awaiting-approval" ||
    run.state.status === "awaiting-answer";
  const sessionAcceptsInput =
    sessions.activeSession.status === "ready" ||
    sessions.activeSession.status === "empty";
  const disabled =
    !sessionAcceptsInput || isAwaitingHumanInput || composer.isSending;

  return (
    <ComposerBar
      value={composer.draft}
      onValueChange={composer.setDraft}
      attachments={composer.attachments}
      onAddAttachments={composer.addAttachments}
      onRemoveAttachment={composer.removeAttachment}
      onSend={async () => (await composer.send()).accepted}
      canSend={composer.canSend}
      models={models.models}
      selectedModelId={models.selectedModelId}
      onModelChange={(id) => models.select(id)}
      onStop={() => void run.stop()}
      isStreaming={isStreaming}
      disabled={disabled}
      sessionNotice={run.notice}
      messages={sessions.activeSession.data?.messages ?? []}
    />
  );
}

export function QJudgeCopilotEmptyState(_props: CopilotEmptyStateProps) {
  const sessions = useCopilotSessions();
  const run = useCopilotRun();
  return (
    <MessageList
      messages={[]}
      activeSessionId={sessions.activeSession.id}
      activeSession={sessions.activeSession}
      run={run.state}
      messageComponent={MessageBubble}
    />
  );
}

export function QJudgeCopilotErrorState({
  error,
  onRetry,
}: CopilotErrorStateProps) {
  const { t } = useTranslation("chatbot");
  return (
    <div>
      <InlineNotification
        hideCloseButton
        kind="error"
        lowContrast
        role="alert"
        title={error.message ?? t("ui.error")}
      />
      {onRetry && (
        <button type="button" onClick={onRetry}>
          {t("ui.retry")}
        </button>
      )}
    </div>
  );
}
