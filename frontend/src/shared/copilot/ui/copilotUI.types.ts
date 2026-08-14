import type { ComponentType } from "react";
import type {
  CopilotActiveSessionState,
  CopilotError,
  CopilotMessage,
  CopilotRunState,
  CopilotSessionSummary,
} from "@/core/copilot";
import type { CopilotApprovalCardProps } from "./CopilotApprovalCard";
import type { CopilotComposerProps } from "./CopilotComposer";
import type { CopilotHeaderProps } from "./CopilotHeader";
import type { CopilotMessageViewProps } from "./CopilotMessageView";
import type { CopilotQuestionCardProps } from "./CopilotQuestionCard";

export interface CopilotEmptyStateProps { onNewSession(): void; }
export interface CopilotErrorStateProps { error: CopilotError; onRetry?(): void; }
export interface CopilotHistorySlotProps {
  sessions: readonly CopilotSessionSummary[];
  activeSession: CopilotActiveSessionState;
  onSelect(id: string): void;
  onCreate(): void;
  onRename(id: string, title: string): void;
  onRemove(id: string): void;
}
export interface CopilotMessageListSlotProps {
  messages: readonly CopilotMessage[];
  activeSessionId: string | null;
  activeSession: CopilotActiveSessionState;
  run: CopilotRunState;
  messageComponent: ComponentType<CopilotMessageViewProps>;
}
export interface CopilotSuggestion {
  label: string;
  message: string;
}
export interface CopilotSuggestionsProps {
  options: readonly CopilotSuggestion[];
  disabled: boolean;
  onSelect(message: string): void;
}
export interface CopilotUISlots {
  header?: ComponentType<CopilotHeaderProps>;
  history?: ComponentType<CopilotHistorySlotProps>;
  messageList?: ComponentType<CopilotMessageListSlotProps>;
  message?: ComponentType<CopilotMessageViewProps>;
  suggestions?: ComponentType<CopilotSuggestionsProps>;
  composer?: ComponentType<CopilotComposerProps>;
  approval?: ComponentType<CopilotApprovalCardProps>;
  question?: ComponentType<CopilotQuestionCardProps>;
  emptyState?: ComponentType<CopilotEmptyStateProps>;
  errorState?: ComponentType<CopilotErrorStateProps>;
}
