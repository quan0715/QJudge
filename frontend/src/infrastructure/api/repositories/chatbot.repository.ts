import type { ChatbotRepository } from "@/core/ports/chatbot.repository";
import type {
  ApprovalRequest,
  ModelInfo,
  PendingAction,
  SendMessageOptions,
  StreamCallbacks,
  ToolInfo,
  ChatMessage,
  ChatSession,
  VerificationReport,
} from "@/core/types/chatbot.types";
import { httpClient } from "@/infrastructure/api/http.client";

const BASE_URL = "/api/v1/ai/sessions";
const AI_BASE = "/api/v1/ai";

// ===== v2 SSE event shape from ai-service =====
interface V2StreamEvent {
  type:
    | "run_started"
    | "agent_message_delta"
    | "thinking_delta"
    | "verification_report"
    | "tool_call_started"
    | "tool_call_finished"
    | "approval_required"
    | "usage_report"
    | "run_completed"
    | "run_failed"
    // legacy (still handled for transition)
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

  // run_started
  run_id?: string;
  thread_id?: string;

  // agent_message_delta / delta
  content?: string;

  // verification_report
  iteration?: number;
  passed?: boolean;
  issues?: string[];
  summary?: string;

  // tool_call_started
  tool_name?: string;
  tool_call_id?: string;
  input_data?: Record<string, unknown>;

  // tool_call_finished
  result?: string | Record<string, unknown>;
  is_error?: boolean;

  // approval_required
  action_id?: string;
  action_type?: string;
  preview?: Record<string, unknown>;

  // usage_report
  input_tokens?: number;
  output_tokens?: number;
  cost_cents?: number;
  model_used?: string;

  // run_failed
  error_code?: string;
  message?: string;

  // legacy fields
  session_id?: string;
  backend_session_id?: string;
  is_new_session?: boolean;
  thinking?: string;
  signature?: string;
  tool_use_id?: string;
  input?: Record<string, unknown>;
  start_time_ms?: number;
  duration_ms?: number;
  skill_metadata?: { skill?: string; gate?: string };
}

// ===== Backend response types =====
interface BackendMessage {
  id: number;
  role: string;
  content: string;
  message_type: string;
  metadata?: Record<string, unknown>;
  created_at: string;
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
  session_id: string;
  title: string;
  messages: BackendMessage[];
  created_at: string;
  updated_at: string;
}

// ===== Helpers =====
function convertBackendMessage(backendMsg: BackendMessage): ChatMessage {
  const metadata = backendMsg.metadata ?? {};
  const thinking =
    typeof metadata.thinking === "string" ? metadata.thinking : undefined;
  const tools = Array.isArray(metadata.tools_executed)
    ? metadata.tools_executed
        .map((tool): ToolInfo | null => {
          if (!tool || typeof tool !== "object") return null;
          const t = tool as Record<string, unknown>;
          return {
            toolName: typeof t.tool_name === "string" ? t.tool_name : "",
            toolCallId: typeof t.tool_call_id === "string" ? t.tool_call_id : "",
            toolUseId: typeof t.tool_use_id === "string" ? t.tool_use_id : "",
            inputData:
              typeof t.input === "object" && t.input !== null
                ? (t.input as Record<string, unknown>)
                : undefined,
            result:
              typeof t.result === "string" ||
              (typeof t.result === "object" && t.result !== null)
                ? (t.result as string | Record<string, unknown>)
                : undefined,
            isError: typeof t.is_error === "boolean" ? t.is_error : undefined,
          };
        })
        .filter((t): t is ToolInfo => t !== null)
    : undefined;

  return {
    id: backendMsg.id.toString(),
    role: backendMsg.role as "user" | "assistant",
    content: backendMsg.content,
    timestamp: new Date(backendMsg.created_at),
    thinkingInfo: thinking ? { thinking, signature: "" } : undefined,
    toolExecutions: tools,
  };
}

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
    if (httpError.response?.status === 401)
      throw new Error("請先登入以使用 AI 助教功能");
    if (httpError.response?.status === 403) throw new Error("無權存取此對話");
    if (httpError.response?.status === 404)
      throw new Error("對話不存在或已被刪除");
    if (httpError.response?.status === 426)
      throw new Error("請更新前端版本以使用 AI 助教功能");
    throw error;
  }
}

// ===== Repository Implementation =====
const chatbotRepository: ChatbotRepository = {
  async getSessions(): Promise<ChatSession[]> {
    const response = await requestJson<PaginatedResponse<BackendSessionListItem>>(
      httpClient.get(`${BASE_URL}/`),
      "無法載入對話列表"
    );
    const sessions = response.results || [];
    return sessions.map((session) => ({
      id: session.session_id,
      title: session.title,
      messages: [],
      createdAt: new Date(session.created_at),
      updatedAt: new Date(session.updated_at),
    }));
  },

  async getSession(sessionId: string | number): Promise<ChatSession> {
    const data = await requestJson<BackendSession>(
      httpClient.get(`${BASE_URL}/${sessionId.toString()}/`),
      "無法載入對話"
    );
    const messages: ChatMessage[] = (data.messages || []).map(convertBackendMessage);
    return {
      id: data.session_id,
      title: data.title,
      messages,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  },

  async createSession(): Promise<ChatSession> {
    const sessionId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
    return await requestJson<{ id: string; status: string }>(
      httpClient.post(`${BASE_URL}/new_session/`),
      "無法創建後端會話"
    );
  },

  async deleteSession(sessionId: string | number): Promise<void> {
    const response = await httpClient.delete(`${BASE_URL}/${sessionId.toString()}/`);
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

  async clearSession(sessionId: string | number): Promise<ChatSession> {
    const data = await requestJson<BackendSession>(
      httpClient.post(`${BASE_URL}/${sessionId.toString()}/clear/`, {}),
      "無法清除對話"
    );
    return {
      id: data.session_id,
      title: data.title,
      messages: [],
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  },

  async submitAnswer(
    sessionId: string | number,
    requestId: string,
    answers: Record<string, string>
  ): Promise<{ success: boolean; message?: string }> {
    return await requestJson<{ success: boolean; message?: string }>(
      httpClient.post(`${BASE_URL}/${sessionId.toString()}/submit_answer/`, {
        request_id: requestId,
        answers,
      }),
      "無法提交回答"
    );
  },

  // ============================================================
  // v2: New API methods
  // ============================================================

  async getModels(): Promise<ModelInfo[]> {
    const data = await requestJson<{ models: ModelInfo[] }>(
      httpClient.get(`${AI_BASE}/models/`),
      "無法載入模型列表"
    );
    return data.models;
  },

  async getActivePendingAction(
    sessionId: string | number
  ): Promise<PendingAction | null> {
    const data = await requestJson<{ active_action: PendingAction | null }>(
      httpClient.get(
        `${BASE_URL}/${sessionId.toString()}/pending-actions/active/`
      ),
      "無法載入待確認動作"
    );
    return data.active_action;
  },

  async confirmAction(
    sessionId: string | number,
    actionId: string
  ): Promise<PendingAction> {
    return await requestJson<PendingAction>(
      httpClient.post(
        `${BASE_URL}/${sessionId.toString()}/actions/${actionId}/confirm/`,
        {}
      ),
      "無法確認動作"
    );
  },

  async cancelAction(
    sessionId: string | number,
    actionId: string
  ): Promise<PendingAction> {
    return await requestJson<PendingAction>(
      httpClient.post(
        `${BASE_URL}/${sessionId.toString()}/actions/${actionId}/cancel/`,
        {}
      ),
      "無法取消動作"
    );
  },

  // ============================================================
  // v2: Resume interrupted agent stream
  // ============================================================

  async resumeAgentStream(
    sessionId: string | number,
    decision: "approve" | "reject",
    callbacks: StreamCallbacks,
  ) {
    try {
      const urlSessionId = sessionId.toString();
      const resolvedSessionId = urlSessionId;

      const payload = { decision };

      const response = await httpClient.request(
        `${BASE_URL}/${urlSessionId}/resume_stream/`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          headers: {
            "Content-Type": "application/json",
            "X-QJudge-Agent-Contract": "v2",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      const currentMessage: Partial<ChatMessage> = {
        content: "",
        isThinking: false,
      };

      let hasTerminalEvent = false;

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
            if (event.type === "run_completed" || event.type === "run_failed" || event.type === "done" || event.type === "error") {
              hasTerminalEvent = true;
            }
            this._handleStreamEvent(
              event,
              currentMessage,
              callbacks,
              resolvedSessionId,
              () => {} // no need to update resolved ID for resume
            );
          } catch (e) {
            console.debug("Failed to parse resume stream event:", e);
          }
        }
      }

      // Handle final buffered line
      const finalLine = buffer.trim();
      if (finalLine.startsWith("data: ")) {
        try {
          const event: V2StreamEvent = JSON.parse(finalLine.slice(6));
          if (event.type === "run_completed" || event.type === "run_failed" || event.type === "done" || event.type === "error") {
            hasTerminalEvent = true;
          }
          this._handleStreamEvent(
            event,
            currentMessage,
            callbacks,
            resolvedSessionId,
            () => {}
          );
        } catch (e) {
          console.debug("Failed to parse final resume event:", e);
        }
      }

      // Safety net: if stream ended without any terminal event, force completion
      if (!hasTerminalEvent) {
        console.warn("Resume stream ended without terminal event, forcing completion");
        this.getSession(resolvedSessionId)
          .then((freshSession: ChatSession) => callbacks.onComplete?.(freshSession))
          .catch(() => callbacks.onError?.("Stream 異常結束"));
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      callbacks.onError?.(`Resume 失敗: ${errorMessage}`);
    }
  },

  // ============================================================
  // v2: SSE Stream (new event parser)
  // ============================================================

  async sendMessageStream(
    sessionId: string | number,
    content: string,
    callbacks: StreamCallbacks,
    options?: SendMessageOptions
  ) {
    try {
      const urlSessionId = sessionId.toString();
      let resolvedSessionId = urlSessionId;

      // v2 payload
      const payload: Record<string, unknown> = {
        content,
        model_id: options?.model || "claude-sonnet",
        system_prompt: options?.context
          ? JSON.stringify(options.context)
          : undefined,
        skill: options?.skill,
      };

      const response = await httpClient.request(
        `${BASE_URL}/${urlSessionId}/send_message_stream/`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          headers: {
            "Content-Type": "application/json",
            "X-QJudge-Agent-Contract": "v2",
          },
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
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      const currentMessage: Partial<ChatMessage> = {
        content: "",
        isThinking: true,
      };

      let hasTerminalEvent = false;

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
            if (event.type === "run_completed" || event.type === "run_failed" || event.type === "done" || event.type === "error") {
              hasTerminalEvent = true;
            }
            this._handleStreamEvent(
              event,
              currentMessage,
              callbacks,
              resolvedSessionId,
              (id: string) => { resolvedSessionId = id; }
            );
          } catch (e) {
            console.debug("Failed to parse stream event:", e);
          }
        }
      }

      // Handle final buffered line
      const finalLine = buffer.trim();
      if (finalLine.startsWith("data: ")) {
        try {
          const event: V2StreamEvent = JSON.parse(finalLine.slice(6));
          if (event.type === "run_completed" || event.type === "run_failed" || event.type === "done" || event.type === "error") {
            hasTerminalEvent = true;
          }
          this._handleStreamEvent(
            event,
            currentMessage,
            callbacks,
            resolvedSessionId,
            (id: string) => { resolvedSessionId = id; }
          );
        } catch (e) {
          console.debug("Failed to parse final stream event:", e);
        }
      }

      // Safety net: if stream ended without any terminal event, force completion
      if (!hasTerminalEvent) {
        console.warn("Stream ended without terminal event, forcing completion");
        this.getSession(resolvedSessionId)
          .then((freshSession: ChatSession) => callbacks.onComplete?.(freshSession))
          .catch(() => callbacks.onError?.("Stream 異常結束"));
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      callbacks.onError?.(`無法發送訊息: ${errorMessage}`);
    }
  },

  /** Internal: handle a single SSE event */
  _handleStreamEvent(
    event: V2StreamEvent,
    currentMessage: Partial<ChatMessage>,
    callbacks: StreamCallbacks,
    resolvedSessionId: string,
    setResolvedId: (id: string) => void
  ) {
    switch (event.type) {
      // ===== v2 Events =====
      case "run_started":
        console.debug("SSE: run_started", { runId: event.run_id, threadId: event.thread_id });
        // DeepAgent v2 uses thread_id as the canonical session id.
        // For newly created chats, this replaces the temporary backend session id.
        if (event.thread_id) {
          setResolvedId(event.thread_id);
        }
        break;

      case "agent_message_delta":
        if (event.content) {
          currentMessage.content = (currentMessage.content || "") + event.content;
          currentMessage.isThinking = false;
          callbacks.onMessageUpdate?.({ ...currentMessage });
        }
        break;

      case "thinking_delta":
        if (event.content) {
          const prevThinking = currentMessage.thinkingInfo?.thinking || "";
          currentMessage.thinkingInfo = {
            thinking: prevThinking + event.content,
            signature: "",
          };
          currentMessage.isThinking = true;
          callbacks.onMessageUpdate?.({ ...currentMessage });
        }
        break;

      case "verification_report": {
        const report: VerificationReport = {
          iteration: event.iteration ?? 0,
          passed: event.passed ?? false,
          issues: event.issues ?? [],
          summary: event.summary ?? "",
        };
        currentMessage.verificationReports = [
          ...(currentMessage.verificationReports || []),
          report,
        ];
        callbacks.onVerificationReport?.(report);
        callbacks.onMessageUpdate?.({ ...currentMessage });
        break;
      }

      case "tool_call_started":
        if (event.tool_name) {
          currentMessage.toolName = event.tool_name;
          currentMessage.isThinking = false;
          callbacks.onMessageUpdate?.({ ...currentMessage });
        }
        break;

      case "tool_call_finished": {
        const toolInfo: ToolInfo = {
          toolName: currentMessage.toolName || "",
          toolCallId: event.tool_call_id || "",
          result: event.result,
          isError: event.is_error,
        };
        currentMessage.toolExecutions = [
          ...(currentMessage.toolExecutions || []),
          toolInfo,
        ];
        currentMessage.toolName = undefined;
        callbacks.onMessageUpdate?.({ ...currentMessage });
        break;
      }

      case "approval_required":
        if (event.action_id && event.action_type && event.preview) {
          const approval: ApprovalRequest = {
            actionId: event.action_id,
            actionType: event.action_type as "create" | "patch",
            preview: event.preview,
          };
          callbacks.onApprovalRequired?.(approval);
        }
        break;

      case "usage_report":
        console.debug("SSE: usage_report", {
          inputTokens: event.input_tokens,
          outputTokens: event.output_tokens,
          costCents: event.cost_cents,
          modelUsed: event.model_used,
        });
        break;

      case "run_completed": {
        console.debug("SSE: run_completed", { runId: event.run_id });
        // Fetch fresh session
        this.getSession(resolvedSessionId)
          .then((freshSession: ChatSession) => callbacks.onComplete?.(freshSession))
          .catch((err: Error) => {
            console.warn("Failed to fetch session after run_completed:", err);
            callbacks.onError?.("對話同步失敗，請重新整理後再試");
          });
        break;
      }

      case "run_failed":
        console.debug("SSE: run_failed", {
          errorCode: event.error_code,
          message: event.message,
        });
        callbacks.onError?.(event.message || "Agent 執行失敗");
        break;

      // ===== Legacy Events (kept for transition) =====
      case "init":
        console.debug("SSE: init (legacy)", { backendSessionId: event.backend_session_id });
        break;

      case "session":
        if (event.session_id) {
          setResolvedId(event.session_id);
        }
        break;

      case "delta":
        if (event.content) {
          currentMessage.content = (currentMessage.content || "") + event.content;
          currentMessage.isThinking = false;
          callbacks.onMessageUpdate?.({ ...currentMessage });
        }
        break;

      case "thinking":
        if (event.thinking) {
          currentMessage.thinkingInfo = {
            thinking: event.thinking,
            signature: event.signature || "",
          };
          currentMessage.isThinking = true;
          callbacks.onMessageUpdate?.({ ...currentMessage });
        }
        break;

      case "tool_start":
        if (event.tool_name) {
          currentMessage.toolName = event.tool_name;
          currentMessage.isThinking = false;
          callbacks.onMessageUpdate?.({ ...currentMessage });
        }
        break;

      case "tool_result": {
        const legacyTool: ToolInfo = {
          toolName: event.tool_name || "",
          toolCallId: event.tool_use_id || "",
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
          legacyTool,
        ];
        currentMessage.toolName = undefined;
        callbacks.onMessageUpdate?.({ ...currentMessage });
        break;
      }

      case "usage":
        console.debug("SSE: usage (legacy)", {
          inputTokens: event.input_tokens,
          outputTokens: event.output_tokens,
        });
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

      case "done":
        this.getSession(resolvedSessionId)
          .then((freshSession: ChatSession) => callbacks.onComplete?.(freshSession))
          .catch((err: Error) => console.warn("Failed to fetch session after done:", err));
        break;

      case "error":
        if (event.content) {
          callbacks.onError?.(event.content);
        }
        break;

      default:
        console.debug("SSE: unknown event type", { type: event.type });
    }
  },
} as ChatbotRepository & {
  _handleStreamEvent: (
    event: V2StreamEvent,
    currentMessage: Partial<ChatMessage>,
    callbacks: StreamCallbacks,
    resolvedSessionId: string,
    setResolvedId: (id: string) => void
  ) => void;
};

export default chatbotRepository;
