import type {
  ChatRun,
  ChatSession,
  ModelInfo,
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
  startRun(
    sessionId: string | number,
    content: string,
    options?: SendMessageOptions
  ): Promise<ChatRun>;
  getActiveRuns(): Promise<ChatRun[]>;
  subscribeRunEvents(
    run: ChatRun,
    callbacks: StreamCallbacks,
    options?: SendMessageOptions
  ): Promise<void>;
  cancelRun(runId: string): Promise<ChatRun>;
  submitRunApproval(runId: string, decision: "approve" | "reject"): Promise<ChatRun>;

  // v2: Model list
  getModels(): Promise<ModelInfo[]>;
}
