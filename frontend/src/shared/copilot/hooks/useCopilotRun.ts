import type { CopilotRunState, CopilotTransportCapabilities } from "@/core/copilot";
import {
  useCopilotRunCommandsContext,
  useCopilotStateContext,
} from "../react/copilotContexts";

export interface UseCopilotRunResult {
  state: CopilotRunState;
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
  return { state, capabilities, stop, submitApproval, submitAnswer, retry };
}
