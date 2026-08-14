import type {
  CopilotActiveSessionState,
  CopilotCreateSessionInput,
  CopilotError,
  CopilotRemoveSessionResult,
  CopilotRenameSessionResult,
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
  startNew(): void;
  select(id: string): Promise<void>;
  rename(id: string, title: string): Promise<CopilotRenameSessionResult>;
  remove(id: string): Promise<CopilotRemoveSessionResult>;
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
