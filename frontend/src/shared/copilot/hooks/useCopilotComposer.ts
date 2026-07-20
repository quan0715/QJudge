import type { CopilotPendingAttachment, CopilotSendResult } from "@/core/copilot";
import { useCopilotComposerContext } from "../react/copilotContexts";

export interface UseCopilotComposerResult {
  draft: string;
  attachments: readonly CopilotPendingAttachment[];
  canSend: boolean;
  setDraft(value: string): void;
  addAttachments(files: readonly File[]): Promise<void>;
  removeAttachment(id: string): void;
  send(): Promise<CopilotSendResult>;
  reset(): void;
}

export function useCopilotComposer(): UseCopilotComposerResult {
  return useCopilotComposerContext();
}
