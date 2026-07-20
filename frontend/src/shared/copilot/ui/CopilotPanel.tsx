import type { ComponentType } from "react";
import { useCopilot } from "../hooks/useCopilot";
import { useCopilotRun } from "../hooks/useCopilotRun";
import { useCopilotSessions } from "../hooks/useCopilotSessions";
import { CopilotApprovalCard } from "./CopilotApprovalCard";
import { CopilotComposer } from "./CopilotComposer";
import { CopilotHeader } from "./CopilotHeader";
import { CopilotHistoryPanel } from "./CopilotHistoryPanel";
import { CopilotMessageList } from "./CopilotMessageList";
import { CopilotMessageView } from "./CopilotMessageView";
import { CopilotQuestionCard } from "./CopilotQuestionCard";
import type {
  CopilotHistorySlotProps,
  CopilotMessageListSlotProps,
  CopilotSuggestion,
  CopilotSuggestionsProps,
  CopilotUISlots,
} from "./copilotUI.types";

export interface CopilotPanelProps {
  showHeader?: boolean;
  showHistory?: boolean;
  slots?: CopilotUISlots;
}

function isSuggestion(value: unknown): value is CopilotSuggestion {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.label === "string" &&
    typeof candidate.message === "string"
  );
}

function findLatestSuggestions(
  messages: CopilotMessageListSlotProps["messages"],
): readonly CopilotSuggestion[] {
  const latestAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  if (!latestAssistant) return [];
  for (const part of [...latestAssistant.parts].reverse()) {
    if (part.type !== "data-next-turn-options" || !Array.isArray(part.data)) {
      continue;
    }
    const options = part.data.filter(isSuggestion);
    if (options.length > 0) return options;
  }
  return [];
}

function DefaultCopilotSuggestions({
  options,
  disabled,
  onSelect,
}: CopilotSuggestionsProps) {
  return (
    <div className="copilot-suggestions" aria-label="Suggested replies">
      {options.map((option) => (
        <button
          type="button"
          key={`${option.label}:${option.message}`}
          disabled={disabled}
          onClick={() => onSelect(option.message)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function CopilotPanel({
  showHeader = true,
  showHistory = false,
  slots = {},
}: CopilotPanelProps) {
  const copilot = useCopilot();
  const sessions = useCopilotSessions();
  const run = useCopilotRun();
  const Header = slots.header ?? CopilotHeader;
  const History: ComponentType<CopilotHistorySlotProps> =
    slots.history ?? CopilotHistoryPanel;
  const MessageList: ComponentType<CopilotMessageListSlotProps> =
    slots.messageList ?? CopilotMessageList;
  const Message = slots.message ?? CopilotMessageView;
  const Suggestions = slots.suggestions ?? DefaultCopilotSuggestions;
  const Composer = slots.composer ?? CopilotComposer;
  const Approval = slots.approval ?? CopilotApprovalCard;
  const Question = slots.question ?? CopilotQuestionCard;
  const Empty = slots.emptyState;
  const ErrorState = slots.errorState;
  const messages = copilot.activeSession.data?.messages ?? [];
  const suggestions = findLatestSuggestions(messages);
  const showSuggestions =
    run.state.status === "ready" && suggestions.length > 0;

  return (
    <section className="copilot-panel-content">
      {showHeader && (
        <Header
          activeSession={copilot.activeSession}
          run={run.state}
          onNewSession={() => void sessions.create()}
        />
      )}
      <div className="copilot-panel-body">
        {showHistory && (
          <History
            sessions={sessions.sessions}
            activeSession={sessions.activeSession}
            onSelect={(id) => void sessions.select(id)}
            onCreate={() => void sessions.create()}
            onRename={(id, title) => void sessions.rename(id, title)}
            onRemove={(id) => void sessions.remove(id)}
          />
        )}
        <div className="copilot-conversation">
          {sessions.activeSession.status === "error" && ErrorState ? (
            <ErrorState
              error={sessions.activeSession.error}
              onRetry={() => void sessions.refresh()}
            />
          ) : messages.length === 0 && Empty ? (
            <Empty onNewSession={() => void sessions.create()} />
          ) : (
            <MessageList
              messages={messages}
              activeSessionId={copilot.activeSession.id}
              activeSession={copilot.activeSession}
              run={run.state}
              messageComponent={Message}
            />
          )}
          {run.state.status === "awaiting-approval" && (
            <Approval
              request={run.state.request}
              interactionError={run.state.interactionError}
              onSubmit={(decision) => void run.submitApproval(decision)}
            />
          )}
          {run.state.status === "awaiting-answer" && (
            <Question
              request={run.state.request}
              interactionError={run.state.interactionError}
              onSubmit={(answer) => void run.submitAnswer(answer)}
            />
          )}
          {run.state.status === "error" && ErrorState && (
            <ErrorState
              error={run.state.error}
              onRetry={() => void run.retry()}
            />
          )}
          {showSuggestions && (
            <Suggestions
              options={suggestions}
              disabled={false}
              onSelect={(message) => void copilot.send({ text: message })}
            />
          )}
          <Composer />
        </div>
      </div>
    </section>
  );
}
