import type { ComponentType } from "react";
import type { CopilotError } from "@/core/copilot";
import type { CopilotApprovalCardProps } from "./CopilotApprovalCard";
import type { CopilotComposerProps } from "./CopilotComposer";
import type { CopilotHeaderProps } from "./CopilotHeader";
import type { CopilotMessageViewProps } from "./CopilotMessageView";
import type { CopilotQuestionCardProps } from "./CopilotQuestionCard";

export interface CopilotEmptyStateProps { onNewSession(): void; }
export interface CopilotErrorStateProps { error: CopilotError; onRetry?(): void; }
export interface CopilotUISlots {
  header?: ComponentType<CopilotHeaderProps>;
  message?: ComponentType<CopilotMessageViewProps>;
  composer?: ComponentType<CopilotComposerProps>;
  approval?: ComponentType<CopilotApprovalCardProps>;
  question?: ComponentType<CopilotQuestionCardProps>;
  emptyState?: ComponentType<CopilotEmptyStateProps>;
  errorState?: ComponentType<CopilotErrorStateProps>;
}
