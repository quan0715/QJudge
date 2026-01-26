import type { ChatbotRepository } from "@/core/ports/chatbot.repository";
import type {
  SendMessageOptions,
  UserInputRequest,
  ThinkingInfo,
  ToolInfo,
  ChatMessage,
  ChatSession,
} from "@/core/types/chatbot.types";
import { httpClient } from "@/infrastructure/api/http.client";

const BASE_URL = "/api/v1/ai/sessions";

/**
 * Convert backend message format to frontend ChatMessage format
 * Backend returns created_at as ISO 8601 string, we need to convert to Date and map to timestamp
 */
function convertBackendMessage(backendMsg: BackendMessage): ChatMessage {
  return {
    id: backendMsg.id.toString(),
    role: backendMsg.role as "user" | "assistant",
    content: backendMsg.content,
    timestamp: new Date(backendMsg.created_at), // Convert ISO string to Date
  };
}

interface AIServiceStreamEvent {
  type: "delta" | "session" | "done" | "error" | "init";
  content?: string;
  session_id?: string;
  backend_session_id?: string;
  frontend_session_id?: string;
}

interface BackendMessage {
  id: number;
  role: string;
  content: string;
  message_type: string;
  metadata?: Record<string, unknown>;
  created_at: string; // ISO 8601 format from backend
}

interface BackendSessionListItem {
  session_id: string;
  user: number;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

interface BackendSession {
  id: string;
  title: string;
  messages: BackendMessage[];
  created_at: string;
  updated_at: string;
}

interface BackendSessionCreate {
  id: string;
  title: string;
}

/**
 * 請求 JSON 並進行錯誤處理
 */
async function requestJson<T>(
  fetchPromise: Promise<Response>,
  errorMessage: string
): Promise<T> {
  try {
    const response = await fetchPromise;

    if (!response.ok) {
      const error = new Error(errorMessage) as Error & { response?: Response };
      error.response = response;
      throw error;
    }

    return response.json();
  } catch (error: unknown) {
    const httpError = error as Error & { response?: Response };
    if (httpError.response?.status === 401) {
      throw new Error("請先登入以使用 AI 助教功能");
    }
    if (httpError.response?.status === 403) {
      throw new Error("無權存取此對話");
    }
    if (httpError.response?.status === 404) {
      throw new Error("對話不存在或已被刪除");
    }
    throw error;
  }
}

const chatbotRepository: ChatbotRepository = {
  async getSessions(): Promise<ChatSession[]> {
    try {
      const response = await requestJson<
        PaginatedResponse<BackendSessionListItem>
      >(httpClient.get(`${BASE_URL}/`), "無法載入對話列表");

      // DRF 返回分頁格式，extract results array
      const sessions = response.results || [];

      // 轉換後端格式到前端格式
      return sessions.map((session) => ({
        id: session.session_id,
        title: session.title,
        messages: [], // 列表時不載入訊息
        createdAt: new Date(session.created_at),
        updatedAt: new Date(session.updated_at),
        metadata: {
          message_count: session.message_count,
        },
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知錯誤";
      throw new Error(errorMessage);
    }
  },

  async getSession(sessionId: string | number): Promise<ChatSession> {
    try {
      const data = await requestJson<BackendSession>(
        httpClient.get(`${BASE_URL}/${sessionId.toString()}/`),
        "無法載入對話"
      );

      const messages: ChatMessage[] = (data.messages || []).map(
        convertBackendMessage
      );

      return {
        id: data.id,
        title: data.title,
        messages,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知錯誤";
      throw new Error(errorMessage);
    }
  },

  async createSession(): Promise<ChatSession> {
    try {
      const data = await requestJson<BackendSessionCreate>(
        httpClient.post(`${BASE_URL}/new_session/`, {}),
        "無法建立新對話"
      );

      return {
        id: data.id,
        title: data.title || "新對話",
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          backend_session_id: data.id,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知錯誤";
      throw new Error(errorMessage);
    }
  },

  async deleteSession(sessionId: string | number): Promise<void> {
    try {
      await requestJson<void>(
        httpClient.delete(`${BASE_URL}/${sessionId.toString()}/`),
        "無法刪除對話"
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知錯誤";
      throw new Error(errorMessage);
    }
  },

  async renameSession(
    sessionId: string | number,
    title: string
  ): Promise<ChatSession> {
    try {
      const data = await requestJson<BackendSession>(
        httpClient.post(`${BASE_URL}/${sessionId.toString()}/rename/`, {
          title,
        }),
        "無法重新命名對話"
      );

      return {
        id: data.id,
        title: data.title,
        messages: [],
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知錯誤";
      throw new Error(errorMessage);
    }
  },

  async clearSession(sessionId: string | number): Promise<ChatSession> {
    try {
      const data = await requestJson<BackendSession>(
        httpClient.post(`${BASE_URL}/${sessionId.toString()}/clear/`, {}),
        "無法清除對話"
      );

      return {
        id: data.id,
        title: data.title,
        messages: [],
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知錯誤";
      throw new Error(errorMessage);
    }
  },

  async submitAnswer(
    sessionId: string | number,
    requestId: string,
    answers: Record<string, string>
  ): Promise<any> {
    try {
      return await requestJson<any>(
        httpClient.post(
          `${BASE_URL}/${sessionId.toString()}/submit_answer/`,
          { request_id: requestId, answers }
        ),
        "無法提交回答"
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知錯誤";
      throw new Error(errorMessage);
    }
  },

  async sendMessageStream(
    sessionId: string | number,
    content: string,
    onDelta: (content: string) => void,
    onToolStart: (toolName: string) => void,
    onDone: () => void,
    onError: (error: string) => void,
    options?: SendMessageOptions,
    onUserInputRequest?: (request: UserInputRequest) => void,
    onThinking?: (thinkingInfo: ThinkingInfo) => void,
    onToolResult?: (toolInfo: ToolInfo) => void
  ) {
    try {
      // Step 1: 確定是否需要先建立後端 session
      let urlSessionId = sessionId.toString();

      // 嘗試建立新 session（如果需要）
      try {
        const newSessionResponse = await httpClient.post(
          `${BASE_URL}/new_session/`,
          {}
        );
        if (newSessionResponse.ok) {
          const newSessionData: BackendSessionCreate =
            await newSessionResponse.json();
          urlSessionId = newSessionData.id;
          console.debug(
            "Created new backend session:",
            newSessionData.id
          );
        }
      } catch (e) {
        console.warn("Failed to create backend session, using provided ID:", e);
        // 繼續使用原始 sessionId
      }

      // Step 2: 準備請求 payload
      const payload: any = {
        content,
        system_prompt: options?.context
          ? JSON.stringify(options.context)
          : undefined,
        skill: options?.skill,
      };

      console.debug("Sending message to session:", {
        urlSessionId,
        sessionId,
      });

      const response = await httpClient.request(
        `${BASE_URL}/${urlSessionId}/send_message_stream/`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 401) {
          onError("請先登入以使用 AI 助教功能");
          return;
        }
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const rawLine of lines) {
          const line = rawLine.trimEnd();
          if (!line.startsWith("data: ")) continue;

          try {
            const event: AIServiceStreamEvent = JSON.parse(line.slice(6));

            if (event.type === "delta" && event.content) {
              onDelta(event.content);
            } else if (event.type === "done") {
              onDone();
            } else if (event.type === "error" && event.content) {
              onError(event.content);
            }
          } catch (e) {
            console.debug("Failed to parse stream event:", e);
          }
        }
      }

      // 處理最後一行
      const finalLine = buffer.trim();
      if (finalLine.startsWith("data: ")) {
        try {
          const event: AIServiceStreamEvent = JSON.parse(finalLine.slice(6));

          if (event.type === "delta" && event.content) {
            onDelta(event.content);
          } else if (event.type === "done") {
            onDone();
          } else if (event.type === "error" && event.content) {
            onError(event.content);
          }
        } catch (e) {
          console.debug("Failed to parse final stream event:", e);
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      onError(`無法發送訊息: ${errorMessage}`);
    }
  },
};

export default chatbotRepository;
