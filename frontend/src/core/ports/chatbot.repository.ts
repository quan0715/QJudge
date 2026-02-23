import type {
  ChatSession,
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
}
