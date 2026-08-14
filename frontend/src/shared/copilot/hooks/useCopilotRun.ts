import type { CopilotRunState, CopilotTransportCapabilities } from "@/core/copilot";
import {
  useCopilotRunCommandsContext,
  useCopilotStateContext,
} from "../react/copilotContexts";

export interface UseCopilotRunResult {
  state: CopilotRunState;
  notice: string | null;
  capabilities: CopilotTransportCapabilities;
  stop(): Promise<void>;
  submitApproval(decision: "approve" | "reject"): Promise<void>;
  submitAnswer(answer: string): Promise<void>;
  retry(): Promise<void>;
}

export function useCopilotRun(): UseCopilotRunResult {
  const { run: state, capabilities } = useCopilotStateContext();
  const { stop, submitApproval, submitAnswer, retry } =
    useCopilotRunCommandsContext();
  const notice =
    state.status === "ready" || !state.run
      ? null
      : typeof state.run.metadata?.notice === "string"
        ? state.run.metadata.notice
        : null;
  return {
    state,
    notice,
    capabilities,
    stop,
    submitApproval,
    submitAnswer,
    retry,
  };
}
