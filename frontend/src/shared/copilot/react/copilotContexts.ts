import { createContext, useContext } from "react";
import type {
  CopilotActiveSessionState,
  CopilotCreateSessionInput,
  CopilotPendingAttachment,
  CopilotSendInput,
  CopilotSendResult,
  CopilotRunState,
  CopilotSessionSummary,
  CopilotSessionLocation,
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
  sessionLocation?: CopilotSessionLocation;
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

export interface CopilotRunCommandsContextValue {
  send(input: CopilotSendInput): Promise<CopilotSendResult>;
  stop(): Promise<void>;
  submitApproval(decision: "approve" | "reject"): Promise<void>;
  submitAnswer(answer: string): Promise<void>;
  retry(): Promise<void>;
  clearError(): void;
}

export interface CopilotComposerContextValue {
  draft: string;
  attachments: readonly CopilotPendingAttachment[];
  selectedModelId: string | null;
  canSend: boolean;
  setDraft(value: string): void;
  setSelectedModel(id: string | null): void;
  addAttachments(files: readonly File[]): Promise<void>;
  removeAttachment(id: string): void;
  send(): Promise<CopilotSendResult>;
  reset(): void;
}

export const CopilotStateContext = createContext<
  CopilotStateContextValue | undefined
>(undefined);
export const CopilotSessionCommandsContext = createContext<
  CopilotSessionCommandsContextValue | undefined
>(undefined);
export const CopilotRunCommandsContext = createContext<
  CopilotRunCommandsContextValue | undefined
>(undefined);
export const CopilotComposerContext = createContext<
  CopilotComposerContextValue | undefined
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

export function useCopilotRunCommandsContext(): CopilotRunCommandsContextValue {
  const value = useContext(CopilotRunCommandsContext);
  if (!value) throw new Error("Copilot hooks must be used inside CopilotProvider");
  return value;
}

export function useCopilotComposerContext(): CopilotComposerContextValue {
  const value = useContext(CopilotComposerContext);
  if (!value) throw new Error("Copilot hooks must be used inside CopilotProvider");
  return value;
}
