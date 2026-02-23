import type { ChatbotRepository } from "@/core/ports/chatbot.repository";
import type {
  SendMessageOptions,
  StreamCallbacks,
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
  type:
    | "init"
    | "session"
    | "delta"
    | "thinking"
    | "tool_start"
    | "tool_result"
    | "usage"
    | "user_input_request"
    | "done"
    | "error";
  content?: string;
  session_id?: string;
  backend_session_id?: string;
  frontend_session_id?: string;
  is_new_session?: boolean;

  // thinking 事件字段
  thinking?: string;
  signature?: string;

  // tool_start/tool_result 事件字段
  tool_name?: string;
  tool_use_id?: string;
  input?: Record<string, unknown>;
  result?: string | Record<string, unknown>;
  is_error?: boolean;
  start_time_ms?: number;
  duration_ms?: number;
  skill_metadata?: {
    skill?: string;
    gate?: string;
  };

  // usage 事件字段
  input_tokens?: number;
  output_tokens?: number;
  cost_cents?: number;
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
    // 只在前端生成臨時 session ID
    // 真正的後端 session 會在第一條訊息發送時建立
    const sessionId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return {
      id: sessionId,
      title: "新對話",
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        // 表示這是一個臨時 session，還未在後端創建
        backend_session_id: undefined,
      },
    };
  },

  async createBackendSession(): Promise<{ id: string; status: string }> {
    return await requestJson<{ id: string; status: string }>(
      httpClient.post(`${BASE_URL}/new_session/`),
      "無法創建後端會話"
    );
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
    callbacks: StreamCallbacks,
    options?: SendMessageOptions
  ) {
    try {
      // 使用傳遞的 session ID
      const urlSessionId = sessionId.toString();

      // 準備請求 payload
      const payload: {
        content: string;
        system_prompt?: string;
        skill?: string;
      } = {
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
          callbacks.onError?.("請先登入以使用 AI 助教功能");
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

      // 維護當前訊息狀態（累積更新）
      const currentMessage: Partial<ChatMessage> = {
        content: "",
        isThinking: true,
      };

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

            // 將低級 SSE 事件轉換為高級回調
            switch (event.type) {
              case "init":
                console.debug("SSE Event: init", {
                  backendSessionId: event.backend_session_id,
                  isNewSession: event.is_new_session,
                });
                // init 事件不需要傳遞給 Hook
                break;

              case "session":
                console.debug("SSE Event: session", {
                  sessionId: event.session_id,
                });
                // session 事件不需要傳遞給 Hook
                break;

              case "thinking":
                console.debug("SSE Event: thinking", {
                  thinkingLength: event.thinking?.length,
                });
                if (event.thinking) {
                  currentMessage.thinkingInfo = {
                    thinking: event.thinking,
                    signature: event.signature || "",
                  };
                  currentMessage.isThinking = true;
                  callbacks.onMessageUpdate?.(currentMessage);
                }
                break;

              case "tool_start":
                console.debug("SSE Event: tool_start", {
                  toolName: event.tool_name,
                  toolUseId: event.tool_use_id,
                });
                if (event.tool_name) {
                  currentMessage.toolName = event.tool_name;
                  currentMessage.isThinking = false;
                  callbacks.onMessageUpdate?.(currentMessage);
                }
                break;

              case "tool_result": {
                console.debug("SSE Event: tool_result", {
                  toolName: event.tool_name,
                  toolUseId: event.tool_use_id,
                  duration: event.duration_ms,
                });
                const toolInfo: ToolInfo = {
                  toolName: event.tool_name || "",
                  toolUseId: event.tool_use_id || "",
                  inputData: event.input,
                  result: event.result,
                  isError: event.is_error,
                  startTimeMs: event.start_time_ms,
                  durationMs: event.duration_ms,
                  skillMetadata: event.skill_metadata,
                };
                currentMessage.toolExecutions = [
                  ...(currentMessage.toolExecutions || []),
                  toolInfo,
                ];
                currentMessage.toolName = undefined;
                callbacks.onMessageUpdate?.(currentMessage);
                break;
              }

              case "usage":
                console.debug("SSE Event: usage", {
                  inputTokens: event.input_tokens,
                  outputTokens: event.output_tokens,
                  costCents: event.cost_cents,
                });
                // usage 事件用於日誌，不傳遞給 Hook
                break;

              case "delta":
                if (event.content) {
                  console.debug("SSE Event: delta", {
                    contentLength: event.content.length,
                  });
                  currentMessage.content = (currentMessage.content || "") + event.content;
                  currentMessage.isThinking = false;
                  callbacks.onMessageUpdate?.(currentMessage);
                }
                break;

              case "user_input_request":
                console.debug("SSE Event: user_input_request");
                if (callbacks.onUserInputRequest && event.content) {
                  try {
                    const request = JSON.parse(event.content);
                    callbacks.onUserInputRequest(request);
                  } catch (e) {
                    console.debug("Failed to parse user input request:", e);
                  }
                }
                break;

              case "done": {
                console.debug("SSE Event: done");
                // 獲取完整 session 並調用 onComplete
                try {
                  const freshSession = await this.getSession(sessionId);
                  callbacks.onComplete?.(freshSession);
                } catch (err) {
                  console.warn("Failed to fetch session after done:", err);
                }
                break;
              }

              case "error":
                console.debug("SSE Event: error", {
                  errorContent: event.content,
                });
                if (event.content) {
                  callbacks.onError?.(event.content);
                }
                break;

              default:
                console.debug("SSE Event: unknown type", { type: event.type });
            }
          } catch (e) {
            console.debug("Failed to parse stream event:", e);
          }
        }
      }

      // 處理最後一行（如果有）
      const finalLine = buffer.trim();
      if (finalLine.startsWith("data: ")) {
        try {
          const event: AIServiceStreamEvent = JSON.parse(finalLine.slice(6));

          // 處理最後一個事件（邏輯同上）
          switch (event.type) {
            case "thinking":
              if (event.thinking) {
                currentMessage.thinkingInfo = {
                  thinking: event.thinking,
                  signature: event.signature || "",
                };
                currentMessage.isThinking = true;
                callbacks.onMessageUpdate?.(currentMessage);
              }
              break;
            case "tool_start":
              if (event.tool_name) {
                currentMessage.toolName = event.tool_name;
                currentMessage.isThinking = false;
                callbacks.onMessageUpdate?.(currentMessage);
              }
              break;
            case "tool_result": {
              const toolInfo: ToolInfo = {
                toolName: event.tool_name || "",
                toolUseId: event.tool_use_id || "",
                inputData: event.input,
                result: event.result,
                isError: event.is_error,
                startTimeMs: event.start_time_ms,
                durationMs: event.duration_ms,
                skillMetadata: event.skill_metadata,
              };
              currentMessage.toolExecutions = [
                ...(currentMessage.toolExecutions || []),
                toolInfo,
              ];
              currentMessage.toolName = undefined;
              callbacks.onMessageUpdate?.(currentMessage);
              break;
            }
            case "delta":
              if (event.content) {
                currentMessage.content = (currentMessage.content || "") + event.content;
                currentMessage.isThinking = false;
                callbacks.onMessageUpdate?.(currentMessage);
              }
              break;
            case "user_input_request":
              if (callbacks.onUserInputRequest && event.content) {
                try {
                  const request = JSON.parse(event.content);
                  callbacks.onUserInputRequest(request);
                } catch (e) {
                  console.debug("Failed to parse user input request:", e);
                }
              }
              break;
            case "done": {
              try {
                const freshSession = await this.getSession(sessionId);
                callbacks.onComplete?.(freshSession);
              } catch (err) {
                console.warn("Failed to fetch session after done:", err);
              }
              break;
            }
            case "error":
              if (event.content) {
                callbacks.onError?.(event.content);
              }
              break;
          }
        } catch (e) {
          console.debug("Failed to parse final stream event:", e);
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      callbacks.onError?.(`無法發送訊息: ${errorMessage}`);
    }
  },
};

export default chatbotRepository;
