import type {
  ChatSession,
  ModelInfo,
  PendingAction,
  SendMessageOptions,
  StreamCallbacks,
} from "@/core/types/chatbot.types";

export interface ChatbotRepository {
  getSessions(): Promise<ChatSession[]>;
  getSession(sessionId: string | number): Promise<ChatSession>;
  createSession(): Promise<ChatSession>;
  createBackendSession(): Promise<{ id: string; status: string }>;
  deleteSession(sessionId: string | number): Promise<void>;
  renameSession(sessionId: string | number, title: string): Promise<ChatSession>;
  clearSession(sessionId: string | number): Promise<ChatSession>;
  submitAnswer(
    sessionId: string | number,
    requestId: string,
    answers: Record<string, string>
  ): Promise<{ success: boolean; message?: string }>;
  sendMessageStream(
    sessionId: string | number,
    content: string,
    callbacks: StreamCallbacks,
    options?: SendMessageOptions
  ): Promise<void>;

  // v2: Model list
  getModels(): Promise<ModelInfo[]>;

  // v2: Pending actions
  getActivePendingAction(sessionId: string | number): Promise<PendingAction | null>;
  confirmAction(sessionId: string | number, actionId: string): Promise<PendingAction>;
  cancelAction(sessionId: string | number, actionId: string): Promise<PendingAction>;

  // v2: Resume interrupted agent stream
  resumeAgentStream(
    sessionId: string | number,
    decision: "approve" | "reject",
    callbacks: StreamCallbacks,
  ): Promise<void>;
}
