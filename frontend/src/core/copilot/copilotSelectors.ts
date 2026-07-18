import type {
  CopilotActiveSessionState,
  CopilotError,
  CopilotRunState,
} from "./copilot.types";
import type { CopilotRuntimeState } from "./copilotReducer";

export function selectActiveSession(
  state: CopilotRuntimeState,
  error: CopilotError | null = null,
): CopilotActiveSessionState {
  const id = state.activeSessionId;
  const data = id ? state.sessions[id] ?? null : null;

  if (error) {
    return { status: "error", id, data, error };
  }
  if (!id) {
    return { status: "empty", id: null, data: null, error: null };
  }
  if (!data) {
    return { status: "loading", id, data: null, error: null };
  }
  return { status: "ready", id, data, error: null };
}

export function selectActiveRun(state: CopilotRuntimeState): CopilotRunState {
  if (!state.activeSessionId) return { status: "ready", run: null };
  return (
    state.runs[state.activeSessionId] ?? { status: "ready", run: null }
  );
}
