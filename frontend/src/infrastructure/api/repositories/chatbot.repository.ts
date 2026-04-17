import type { ChatbotRepository } from "@/core/ports/chatbot.repository";
import type {
  ChatRun,
  ModelInfo,
  SendMessageOptions,
  StreamCallbacks,
  ToolInfo,
  ChatMessage,
  ChatSession,
  RunTodoInputItem,
  RunTodoItem,
  RunTodoStatus,
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
    | "summarization_started"
    | "todo_update"
    | "todos_updated"
    | "todo_list_updated"
    | "verification_report"
  | "tool_call_started"
  | "tool_call_finished"
  | "usage_report"
    | "run_completed"
    | "run_failed"
    | "run_cancelled"
    | "awaiting_approval";
  seq?: number;
  run_status?: string;

  // run_started
  run_id?: string;
  thread_id?: string;

  // agent_message_delta
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

  // usage_report
  input_tokens?: number;
  output_tokens?: number;
  cost_cents?: number;
  model_used?: string;

  // run_failed
  error_code?: string;
  message?: string;

  // awaiting_approval
  action_requests?: Array<{ name: string; args?: Record<string, unknown> }>;
  review_configs?: Array<{ action_name: string; allowed_decisions: string[] }>;
  todos?: RunTodoInputItem[];
  todo_items?: RunTodoInputItem[];

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

interface BackendRun {
  id: string;
  session_id: string;
  status: ChatRun["status"];
  kind: ChatRun["kind"];
  model_id: string;
  last_event_seq: number;
  approval_payload?: {
    action_requests?: Array<{ name: string; args?: Record<string, unknown> }>;
    review_configs?: Array<{ action_name: string; allowed_decisions: string[] }>;
  };
  user_message_id?: number;
  assistant_message_id?: number;
  error?: string;
}

// ===== Helpers =====
function normalizeTodoStatus(status: unknown): RunTodoStatus {
  if (status === "success" || status === "completed" || status === "complete" || status === "done") {
    return "success";
  }
  if (status === "fail" || status === "failed" || status === "error") {
    return "fail";
  }
  return "pending";
}

function normalizeTodoItems(rawTodos: unknown): RunTodoItem[] | undefined {
  if (!Array.isArray(rawTodos)) return undefined;
  return rawTodos
    .map((todo, index): RunTodoItem | null => {
      if (!todo || typeof todo !== "object") return null;
      const item = todo as RunTodoInputItem;
      const label = typeof item.content === "string"
        ? item.content
        : typeof item.label === "string"
          ? item.label
          : "";
      if (!label) return null;
      return {
        id: typeof item.id === "string" && item.id ? item.id : `${index}-${label}`,
        label,
        status: normalizeTodoStatus(item.status),
      };
    })
    .filter((todo): todo is RunTodoItem => todo !== null);
}

function parseTodoCommandItems(commandBody: string): RunTodoItem[] | undefined {
  const todosMatch = commandBody.match(/todos\s*:\s*\[([\s\S]*)\]/);
  if (!todosMatch?.[1]) return undefined;

  const todoItems: RunTodoInputItem[] = [];
  const objectPattern = /\{([^{}]*)\}/g;
  let objectMatch: RegExpExecArray | null;

  while ((objectMatch = objectPattern.exec(todosMatch[1])) !== null) {
    const objectText = objectMatch[1];
    const contentMatch = objectText.match(/content\s*:\s*(?:"([^"]*)"|'([^']*)'|([^,}]+))/);
    const statusMatch = objectText.match(/status\s*:\s*(?:"([^"]*)"|'([^']*)'|([^,}]+))/);
    const content = (contentMatch?.[1] ?? contentMatch?.[2] ?? contentMatch?.[3] ?? "").trim();
    const status = (statusMatch?.[1] ?? statusMatch?.[2] ?? statusMatch?.[3] ?? "pending").trim();

    if (content) {
      todoItems.push({ content, status });
    }
  }

  return normalizeTodoItems(todoItems);
}

function extractTodoCommands(text: string): {
  displayText: string;
  todoItems?: RunTodoItem[];
} {
  let displayText = text;
  let todoItems: RunTodoItem[] | undefined;
  const commandStartPattern = "command(update_";
  let searchStart = 0;

  while (true) {
    const start = displayText.indexOf(commandStartPattern, searchStart);
    if (start === -1) break;

    const bodyStart = start + commandStartPattern.length;
    const end = displayText.indexOf(")", bodyStart);
    if (end === -1) {
      displayText = displayText.slice(0, start);
      break;
    }

    const commandBody = displayText.slice(bodyStart, end);
    todoItems = parseTodoCommandItems(commandBody) ?? todoItems;
    displayText = `${displayText.slice(0, start)}${displayText.slice(end + 1)}`;
    searchStart = start;
  }

  return { displayText, todoItems };
}

function convertBackendMessage(backendMsg: BackendMessage): ChatMessage {
  const metadata = backendMsg.metadata ?? {};
  const thinking =
    typeof metadata.thinking === "string" ? metadata.thinking : undefined;
  const runStatus =
    typeof metadata.run_status === "string" ? metadata.run_status : undefined;
  const runId = typeof metadata.run_id === "string" ? metadata.run_id : undefined;
  const lastEventSeq =
    typeof metadata.last_event_seq === "number" ? metadata.last_event_seq : undefined;
  const tools = Array.isArray(metadata.tools_executed)
    ? metadata.tools_executed
        .map((tool): ToolInfo | null => {
          if (!tool || typeof tool !== "object") return null;
          const t = tool as Record<string, unknown>;
          return {
            toolName: typeof t.tool_name === "string" ? t.tool_name : "",
            toolCallId: typeof t.tool_call_id === "string" ? t.tool_call_id : "",
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
  const todoItems = normalizeTodoItems(metadata.todos) ?? normalizeTodoItems(metadata.todo_items);

  return {
    id: backendMsg.id.toString(),
    role: backendMsg.role as "user" | "assistant",
    content: backendMsg.content,
    timestamp: new Date(backendMsg.created_at),
    thinkingInfo: thinking ? { thinking, signature: "" } : undefined,
    toolExecutions: tools,
    todoItems,
    runId,
    runStatus: runStatus as ChatMessage["runStatus"],
    lastEventSeq,
    isThinking: runStatus === "queued" || runStatus === "running",
  };
}

function convertBackendRun(run: BackendRun): ChatRun {
  return {
    id: run.id,
    sessionId: run.session_id,
    status: run.status,
    kind: run.kind,
    modelId: run.model_id,
    lastEventSeq: run.last_event_seq,
    approvalPayload: run.approval_payload,
    userMessageId: run.user_message_id,
    assistantMessageId: run.assistant_message_id,
    error: run.error,
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

  async startRun(
    sessionId: string | number,
    content: string,
    options?: SendMessageOptions
  ): Promise<ChatRun> {
    const data = await requestJson<BackendRun>(
      httpClient.post(`${BASE_URL}/${sessionId.toString()}/runs/`, {
        content,
        model_id: options?.modelOverride,
      }),
      "無法建立 AI 任務"
    );
    return convertBackendRun(data);
  },

  async getActiveRuns(): Promise<ChatRun[]> {
    const response = await requestJson<PaginatedResponse<BackendRun>>(
      httpClient.get(`${AI_BASE}/runs/?status=active`),
      "無法載入進行中的 AI 任務"
    );
    return (response.results || []).map(convertBackendRun);
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
        throw new Error(`HTTP ${response.status}: ${errorText}`);
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
              () => {}
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
            () => {}
          );
        } catch (e) {
          console.debug("Failed to parse final run event:", e);
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      callbacks.onError?.(`任務訂閱失敗: ${errorMessage}`);
    }
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

  /** Internal: handle a single SSE event */
  _handleStreamEvent(
    event: V2StreamEvent,
    currentMessage: Partial<ChatMessage>,
    callbacks: StreamCallbacks,
    resolvedSessionId: string,
    setResolvedId: (id: string) => void
  ) {
    if (typeof event.seq === "number") {
      currentMessage.lastEventSeq = event.seq;
    }
    if (event.run_status) {
      currentMessage.runStatus = event.run_status as ChatMessage["runStatus"];
    }

    const todoItems = normalizeTodoItems(event.todos) ?? normalizeTodoItems(event.todo_items);
    if (todoItems) {
      currentMessage.todoItems = todoItems;
      callbacks.onTodoItemsUpdate?.(todoItems);
    }

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

      case "summarization_started": {
        callbacks.onSessionNotice?.("對話過長，截取摘要中");
        break;
      }

      case "todo_update":
      case "todos_updated":
      case "todo_list_updated":
        break;

      case "agent_message_delta":
        if (event.content) {
          const messageState = currentMessage as Partial<ChatMessage> & {
            rawAgentContent?: string;
          };
          const rawContent = (messageState.rawAgentContent || currentMessage.content || "") + event.content;
          messageState.rawAgentContent = rawContent;
          const commandResult = extractTodoCommands(rawContent);
          currentMessage.content = commandResult.displayText;
          if (commandResult.todoItems) {
            currentMessage.todoItems = commandResult.todoItems;
            callbacks.onTodoItemsUpdate?.(commandResult.todoItems);
          }
          currentMessage.isThinking = false;
          const messageUpdate = { ...currentMessage } as Partial<ChatMessage> & {
            rawAgentContent?: string;
          };
          delete messageUpdate.rawAgentContent;
          callbacks.onMessageUpdate?.(messageUpdate);
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
        const toolCallId = event.tool_call_id || currentMessage.toolName || "";
        const toolInfo: ToolInfo = {
          toolName: currentMessage.toolName || "",
          toolCallId,
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
        callbacks.onSessionNotice?.(null);
        callbacks.onTodoItemsUpdate?.(null);
        // Fetch fresh session
        this.getSession(resolvedSessionId)
          .then((freshSession: ChatSession) => callbacks.onComplete?.(freshSession))
          .catch((err: Error) => {
            console.warn("Failed to fetch session after run_completed:", err);
            callbacks.onError?.("對話同步失敗，請重新整理後再試");
          });
        break;
      }

      case "run_cancelled": {
        console.debug("SSE: run_cancelled", { runId: event.run_id });
        callbacks.onSessionNotice?.(null);
        callbacks.onTodoItemsUpdate?.(null);
        this.getSession(resolvedSessionId)
          .then((freshSession: ChatSession) => callbacks.onComplete?.(freshSession))
          .catch((err: Error) => {
            console.warn("Failed to fetch session after run_cancelled:", err);
            callbacks.onError?.("對話同步失敗，請重新整理後再試");
          });
        break;
      }

      case "run_failed":
        console.debug("SSE: run_failed", {
          errorCode: event.error_code,
          message: event.message,
        });
        callbacks.onSessionNotice?.(null);
        callbacks.onTodoItemsUpdate?.(null);
        this.getSession(resolvedSessionId)
          .then((freshSession: ChatSession) => callbacks.onComplete?.(freshSession))
          .catch((err: Error) => {
            console.warn("Failed to fetch session after run_failed:", err);
          });
        callbacks.onError?.(event.message || "Agent 執行失敗");
        break;

      case "awaiting_approval": {
        if (event.action_requests?.length) {
          callbacks.onAwaitingApproval?.({
            actionRequests: event.action_requests.map((a) => ({
              name: a.name,
              args: a.args,
            })),
            reviewConfigs: event.review_configs?.map((r) => ({
              actionName: r.action_name,
              allowedDecisions: r.allowed_decisions,
            })),
          });
        }
        break;
      }

      default:
        if (!todoItems) {
          console.debug("SSE: unknown event type", { type: event.type });
        }
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
