import type {
  CopilotActiveSessionState,
  CopilotCreateSessionInput,
  CopilotError,
  CopilotSessionSummary,
} from "@/core/copilot";
import {
  useCopilotSessionCommandsContext,
  useCopilotStateContext,
  type CopilotSessionListStatus,
} from "../react/copilotContexts";

export interface UseCopilotSessionsResult {
  sessions: readonly CopilotSessionSummary[];
  listStatus: CopilotSessionListStatus;
  error: CopilotError | null;
  activeSession: CopilotActiveSessionState;
  create(input?: CopilotCreateSessionInput): Promise<string | null>;
  select(id: string): Promise<void>;
  rename(id: string, title: string): Promise<void>;
  remove(id: string): Promise<void>;
  refresh(): Promise<void>;
  clearError(): void;
}

export function useCopilotSessions(): UseCopilotSessionsResult {
  const { sessions, listStatus, sessionError, activeSession } =
    useCopilotStateContext();
  const commands = useCopilotSessionCommandsContext();
  return {
    sessions,
    listStatus,
    error: sessionError,
    activeSession,
    ...commands,
  };
}
