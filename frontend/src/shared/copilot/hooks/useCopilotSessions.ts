import type {
  CopilotActiveSessionState,
  CopilotCreateSessionInput,
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
  activeSession: CopilotActiveSessionState;
  create(input?: CopilotCreateSessionInput): Promise<string>;
  select(id: string): Promise<void>;
  rename(id: string, title: string): Promise<void>;
  remove(id: string): Promise<void>;
  refresh(): Promise<void>;
}

export function useCopilotSessions(): UseCopilotSessionsResult {
  const { sessions, listStatus, activeSession } = useCopilotStateContext();
  const commands = useCopilotSessionCommandsContext();
  return { sessions, listStatus, activeSession, ...commands };
}
