import type {
  CopilotActiveSessionState,
  CopilotRunState,
  CopilotSendInput,
  CopilotSendResult,
  CopilotSessionSummary,
  CopilotTransportCapabilities,
} from "@/core/copilot";
import {
  useCopilotRunCommandsContext,
  useCopilotStateContext,
} from "../react/copilotContexts";

export interface UseCopilotResult {
  activeSession: CopilotActiveSessionState;
  run: CopilotRunState;
  sessions: readonly CopilotSessionSummary[];
  capabilities: CopilotTransportCapabilities;
  send(input: CopilotSendInput): Promise<CopilotSendResult>;
  stop(): Promise<void>;
  clearError(): void;
}

export function useCopilot(): UseCopilotResult {
  const { activeSession, run, sessions, capabilities } = useCopilotStateContext();
  const { send, stop, clearError } = useCopilotRunCommandsContext();
  return { activeSession, run, sessions, capabilities, send, stop, clearError };
}
