import type { ChatbotRepository } from "@/core/ports/chatbot.repository";
import type {
  ChatRun,
  ModelInfo,
  SendMessageOptions,
  StreamCallbacks,
  ChatMessage,
  ChatSession,
} from "@/core/types/chatbot.types";
import type {
  BackendRun,
  BackendSession,
  BackendSessionListItem,
  PaginatedResponse,
  V2StreamEvent,
} from "@/infrastructure/api/dto/chatbot.dto";
import { httpClient } from "@/infrastructure/api/http.client";
import {
  convertBackendMessage,
  convertBackendRun,
} from "@/infrastructure/mappers/chatbot.mapper";
import { handleChatStreamEvent } from "@/infrastructure/mappers/chatbotStream.mapper";

const BASE_URL = "/api/v1/ai/sessions";
const AI_BASE = "/api/v1/ai";
const OPTIONAL_AI_READ_OPTIONS = { suppressGlobalError: true } as const;

function responseRetryAfterMs(response: Response): number | undefined {
  const header = response.headers.get("Retry-After");
  if (!header) return undefined;
  const seconds = Number(header);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, delay) : undefined;
}

async function requestJson<T>(
  fetchPromise: Promise<Response>,
  errorMessage: string
): Promise<T> {
  try {
    const response = await fetchPromise;
    if (!response.ok) {
      let envelope: unknown;
      try {
        envelope = await response.clone().json();
      } catch {
        envelope = undefined;
      }
      const upstreamMessage =
        envelope &&
        typeof envelope === "object" &&
        "error" in envelope &&
        envelope.error &&
        typeof envelope.error === "object" &&
        "message" in envelope.error &&
        typeof envelope.error.message === "string"
          ? envelope.error.message
          : undefined;
      const error = new Error(upstreamMessage ?? errorMessage) as Error & {
        response?: Response;
        envelope?: unknown;
      };
      error.response = response;
      error.envelope = envelope;
      throw error;
    }
    return response.json();
  } catch (error: unknown) {
    const httpError = error as Error & { response?: Response };
    const status = httpError.response?.status;
    const localizedMessage =
      status === 401
        ? "請先登入以使用 AI 助教功能"
        : status === 403
          ? "無權存取此對話"
          : status === 404
            ? "對話不存在或已被刪除"
            : status === 426
              ? "請更新前端版本以使用 AI 助教功能"
              : undefined;
    if (localizedMessage) {
      throw Object.assign(new Error(localizedMessage), { status });
    }
    if (status !== undefined) {
      Object.assign(httpError, { status, retryAfterMs: responseRetryAfterMs(httpError.response!) });
    }
    throw error;
  }
}

// ===== Repository Implementation =====
// Share only pending reads; each later poll still fetches current run state.
let activeRunsInFlight: Promise<ChatRun[]> | null = null;

const chatbotRepository: ChatbotRepository = {
  async getSessions(): Promise<ChatSession[]> {
    const sessions: BackendSessionListItem[] = [];
    let nextUrl: string | null = `${BASE_URL}/`;

    while (nextUrl) {
      const response: PaginatedResponse<BackendSessionListItem> = await requestJson(
        httpClient.get(nextUrl, OPTIONAL_AI_READ_OPTIONS),
        "無法載入對話列表"
      );
      sessions.push(...(response.results || []));
      // DRF returns absolute URLs (e.g. http://backend:8000/api/...)
      // which cause mixed-content errors. Extract path + query only.
      if (response.next) {
        const parsed: URL = new URL(response.next, window.location.origin);
        nextUrl = parsed.pathname + parsed.search;
      } else {
        nextUrl = null;
      }
    }

    return sessions
      .map((session) => ({
        id: session.session_id,
        title: session.title,
        messages: [],
        context: session.context ?? undefined,
        createdAt: new Date(session.created_at),
        updatedAt: new Date(session.updated_at),
      }))
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
  },

  async getSession(sessionId: string | number): Promise<ChatSession> {
    const data = await requestJson<BackendSession>(
      httpClient.get(
        `${BASE_URL}/${sessionId.toString()}/`,
        OPTIONAL_AI_READ_OPTIONS,
      ),
      "無法載入對話"
    );
    const messages: ChatMessage[] = (data.messages || []).map((message) =>
      convertBackendMessage(message, data.session_id),
    );
    return {
      id: data.session_id,
      title: data.title,
      messages,
      context: data.context ?? undefined,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  },

  async createSession(): Promise<ChatSession> {
    const sessionId = `temp-${Date.now()}-${crypto.randomUUID().replace(/-/g, "").substring(0, 9)}`;
    return {
      id: sessionId,
      title: "新對話",
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: { backend_session_id: undefined },
    };
  },

  async createBackendSession(): Promise<{ id: string; status: string }> {
    const session = await requestJson<BackendSessionListItem>(
      httpClient.post(`${BASE_URL}/new_session/`),
      "無法創建後端會話"
    );
    return { id: session.session_id, status: "ready" };
  },

  async deleteSession(sessionId: string | number): Promise<void> {
    const response = await httpClient.delete(`${BASE_URL}/${sessionId.toString()}/`);
    if (response.status === 409) {
      throw new Error("請先停止對話中的工作，完成取消後再刪除對話");
    }
    if (!response.ok) {
      throw new Error("無法刪除對話");
    }
  },

  async renameSession(sessionId: string | number, title: string): Promise<ChatSession> {
    const data = await requestJson<BackendSession>(
      httpClient.post(`${BASE_URL}/${sessionId.toString()}/rename/`, { title }),
      "無法重新命名對話"
    );
    return {
      id: data.session_id,
      title: data.title,
      messages: [],
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  },

  // ============================================================
  // v2: New API methods
  // ============================================================

  async getModels(): Promise<ModelInfo[]> {
    const data = await requestJson<{ models: ModelInfo[] }>(
      httpClient.get(`${AI_BASE}/models/`, OPTIONAL_AI_READ_OPTIONS),
      "無法載入模型列表"
    );
    return data.models;
  },

  async startRun(
    sessionId: string | number,
    content: string,
    options?: SendMessageOptions
  ): Promise<ChatRun> {
    const data = await requestJson<BackendRun>(
      httpClient.post(
        `${BASE_URL}/${sessionId.toString()}/runs/`,
        {
          content,
          model_id: options?.modelOverride,
          page_context: options?.pageContext,
        },
        options?.idempotencyKey
          ? { headers: { "Idempotency-Key": options.idempotencyKey } }
          : undefined,
      ),
      "無法建立 AI 任務"
    );
    // A pending read may have observed the session before this run existed.
    activeRunsInFlight = null;
    return convertBackendRun(data);
  },

  getActiveRuns(): Promise<ChatRun[]> {
    if (activeRunsInFlight) return activeRunsInFlight;
    const pending = requestJson<PaginatedResponse<BackendRun>>(
      httpClient.get(
        `${AI_BASE}/runs/?status=active`,
        OPTIONAL_AI_READ_OPTIONS,
      ),
      "無法載入進行中的 AI 任務"
    ).then((response) => (response.results || []).map(convertBackendRun))
      .finally(() => {
        if (activeRunsInFlight === pending) activeRunsInFlight = null;
      });
    activeRunsInFlight = pending;
    return pending;
  },

  async subscribeRunEvents(
    run: ChatRun,
    callbacks: StreamCallbacks,
    options?: SendMessageOptions
  ): Promise<void> {
    try {
      const response = await httpClient.request(
        `${AI_BASE}/runs/${run.id}/events/?after=${run.lastEventSeq ?? 0}`,
        {
          method: "GET",
          headers: { "X-QJudge-Agent-Contract": "v2" },
          suppressGlobalError: true,
          signal: options?.signal,
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          callbacks.onError?.("請先登入以使用 AI 助教功能");
          return;
        }
        if (response.status === 426) {
          callbacks.onError?.("請更新前端版本以使用 AI 助教功能");
          return;
        }
        const errorText = await response.text();
        throw Object.assign(new Error(`HTTP ${response.status}: ${errorText}`), {
          status: response.status, retryAfterMs: responseRetryAfterMs(response),
        });
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      const currentMessage: Partial<ChatMessage> = {
      content: "",
      isThinking: run.status === "running" || run.status === "queued",
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
            const event: V2StreamEvent = JSON.parse(line.slice(6));
            this._handleStreamEvent(
              event,
              currentMessage,
              callbacks,
              run.sessionId,
            );
          } catch (e) {
            console.debug("Failed to parse run event:", e);
          }
        }
      }

      // Handle final buffered line
      const finalLine = buffer.trim();
      if (finalLine.startsWith("data: ")) {
        try {
          const event: V2StreamEvent = JSON.parse(finalLine.slice(6));
          this._handleStreamEvent(
            event,
            currentMessage,
            callbacks,
            run.sessionId,
          );
        } catch (e) {
          console.debug("Failed to parse final run event:", e);
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      // Preserve HTTP status and Retry-After for the transport's reconnect path.
      throw error;
    }
  },

  async getChatRun(runId: string): Promise<ChatRun> {
    const data = await requestJson<BackendRun>(
      httpClient.get(`${AI_BASE}/runs/${runId}/`),
      "無法載入 AI 任務"
    );
    return convertBackendRun(data);
  },

  async cancelRun(runId: string): Promise<ChatRun> {
    const data = await requestJson<BackendRun>(
      httpClient.post(`${AI_BASE}/runs/${runId}/cancel/`, {}),
      "無法停止 AI 任務"
    );
    return convertBackendRun(data);
  },

  async submitRunApproval(runId: string, decision: "approve" | "reject"): Promise<ChatRun> {
    const data = await requestJson<BackendRun>(
      httpClient.post(`${AI_BASE}/runs/${runId}/approval/`, { decision }),
      "無法送出核准決定"
    );
    return convertBackendRun(data);
  },

  async submitRunAnswer(runId: string, answer: string): Promise<ChatRun> {
    const data = await requestJson<BackendRun>(
      httpClient.post(`${AI_BASE}/runs/${runId}/answer/`, { answer }),
      "無法提交回答"
    );
    return convertBackendRun(data);
  },

  /** Internal: handle a single SSE event */
  _handleStreamEvent: handleChatStreamEvent,
} as ChatbotRepository & {
  _handleStreamEvent: (
    event: V2StreamEvent,
    currentMessage: Partial<ChatMessage>,
    callbacks: StreamCallbacks,
    resolvedSessionId: string,
  ) => void;
};

export default chatbotRepository;
