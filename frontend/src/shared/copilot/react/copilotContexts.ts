import { createContext, useContext } from "react";
import type {
  CopilotActiveSessionState,
  CopilotCreateSessionInput,
  CopilotRunState,
  CopilotSessionSummary,
  CopilotTransport,
  CopilotTransportCapabilities,
  CopilotTranslations,
} from "@/core/copilot";

export type CopilotSessionListStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

export interface CopilotStateContextValue {
  transport: CopilotTransport;
  translations: CopilotTranslations;
  capabilities: CopilotTransportCapabilities;
  sessions: readonly CopilotSessionSummary[];
  listStatus: CopilotSessionListStatus;
  activeSession: CopilotActiveSessionState;
  run: CopilotRunState;
}

export interface CopilotSessionCommandsContextValue {
  create(input?: CopilotCreateSessionInput): Promise<string>;
  select(id: string): Promise<void>;
  rename(id: string, title: string): Promise<void>;
  remove(id: string): Promise<void>;
  refresh(): Promise<void>;
}

export const CopilotStateContext = createContext<
  CopilotStateContextValue | undefined
>(undefined);
export const CopilotSessionCommandsContext = createContext<
  CopilotSessionCommandsContextValue | undefined
>(undefined);

export function useCopilotStateContext(): CopilotStateContextValue {
  const value = useContext(CopilotStateContext);
  if (!value) throw new Error("Copilot hooks must be used inside CopilotProvider");
  return value;
}

export function useCopilotSessionCommandsContext(): CopilotSessionCommandsContextValue {
  const value = useContext(CopilotSessionCommandsContext);
  if (!value) throw new Error("Copilot hooks must be used inside CopilotProvider");
  return value;
}
