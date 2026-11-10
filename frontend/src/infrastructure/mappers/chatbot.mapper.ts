import type {
  ChatMessage,
  ChatRun,
  RunTodoInputItem,
  RunTodoItem,
  RunTodoStatus,
  ToolInfo,
} from "@/core/types/chatbot.types";
import type {
  BackendMessage,
  BackendRun,
} from "@/infrastructure/api/dto/chatbot.dto";

export function formatDisplayToolName(toolName: string, inputData?: Record<string, unknown>): string {
  if (toolName === "read_file" && inputData && typeof inputData.file_path === "string") {
    const match = inputData.file_path.match(/\/([^/]+)\/SKILL\.md$/);
    if (match) {
      return `__skill__:${match[1]}`;
    }
  }
  return toolName;
}

function normalizeTodoStatus(status: unknown): RunTodoStatus {
  if (status === "success" || status === "completed" || status === "complete" || status === "done") {
    return "success";
  }
  if (status === "in_progress" || status === "running") {
    return "in_progress";
  }
  if (status === "fail" || status === "failed" || status === "error") {
    return "fail";
  }
  return "pending";
}

export function normalizeTodoItems(rawTodos: unknown): RunTodoItem[] | undefined {
  if (!Array.isArray(rawTodos)) return undefined;
  const items = rawTodos
    .map((todo): RunTodoInputItem | null => {
      if (!todo || typeof todo !== "object") return null;
      return todo as RunTodoInputItem;
    })
    .filter((todo): todo is RunTodoInputItem => todo !== null)
    .reduce<RunTodoItem[]>((todoItems, item) => {
      const label = (typeof item.content === "string"
        ? item.content.trim()
        : typeof item.label === "string"
          ? item.label
          : "").trim();
      if (!label) return todoItems;
      const existingIndex = todoItems.findIndex((todo) => todo.label === label);
      const normalizedItem = {
        id: typeof item.id === "string" && item.id
          ? item.id
          : existingIndex >= 0
            ? todoItems[existingIndex].id
            : `${todoItems.length}-${label}`,
        label,
        status: normalizeTodoStatus(item.status),
      };
      if (existingIndex >= 0) {
        todoItems[existingIndex] = normalizedItem;
      } else {
        todoItems.push(normalizedItem);
      }
      return todoItems;
    }, []);
  return items.length > 0 ? items : undefined;
}

function isTimeoutFailure(errorCode?: string, message?: string): boolean {
  const code = (errorCode ?? "").toLowerCase();
  const text = (message ?? "").toLowerCase();
  if (code.includes("timeout")) return true;

  return (
    text.includes("timeout")
    || text.includes("timed out")
    || text.includes("time out")
    || text.includes("deadline")
    || text.includes("exceeded")
    || text.includes("超時")
    || text.includes("逾時")
  );
}

export function toRunFailureMessage(errorCode?: string, message?: string): string {
  if (isTimeoutFailure(errorCode, message)) {
    return "任務執行太長，請手動繼續任務";
  }
  return message || "任務失敗";
}

function findMatchingBracket(text: string, openIndex: number): number {
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function extractTodosListText(commandBody: string): string | undefined {
  const todosKeyMatch = /["']?todos["']?\s*:/.exec(commandBody);
  if (!todosKeyMatch) return undefined;

  const listStart = commandBody.indexOf("[", todosKeyMatch.index + todosKeyMatch[0].length);
  if (listStart === -1) return undefined;

  const listEnd = findMatchingBracket(commandBody, listStart);
  if (listEnd === -1) return undefined;

  return commandBody.slice(listStart + 1, listEnd);
}

function parseTodoCommandItems(commandBody: string): RunTodoItem[] | undefined {
  const todosText = extractTodosListText(commandBody);
  if (!todosText) return undefined;

  const todoItems: RunTodoInputItem[] = [];
  const objectPattern = /\{([^{}]*)\}/g;
  let objectMatch: RegExpExecArray | null;

  while ((objectMatch = objectPattern.exec(todosText)) !== null) {
    const objectText = objectMatch[1];
    const contentMatch = objectText.match(/["']?content["']?\s*:\s*(?:"([^"]*)"|'([^']*)'|([^,}]+))/);
    const statusMatch = objectText.match(/["']?status["']?\s*:\s*(?:"([^"]*)"|'([^']*)'|([^,}]+))/);
    const content = (contentMatch?.[1] ?? contentMatch?.[2] ?? contentMatch?.[3] ?? "").trim();
    const status = (statusMatch?.[1] ?? statusMatch?.[2] ?? statusMatch?.[3] ?? "pending").trim();

    if (content) {
      todoItems.push({ content, status });
    }
  }

  return normalizeTodoItems(todoItems);
}

export function extractTodoCommands(text: string): {
  displayText: string;
  todoItems?: RunTodoItem[];
} {
  let displayText = text;
  let todoItems: RunTodoItem[] | undefined;
  const commandStartPattern = /command\s*\(\s*update(?:=|_)/i;
  let searchStart = 0;

  while (true) {
    const match = commandStartPattern.exec(displayText.slice(searchStart));
    if (!match) break;

    const start = searchStart + match.index;
    const bodyStart = start + match[0].length;
    const end = displayText.indexOf(")", bodyStart);
    if (end === -1) {
      todoItems = parseTodoCommandItems(displayText.slice(bodyStart)) ?? todoItems;
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

export function convertBackendMessage(
  backendMsg: BackendMessage,
  sessionId: string,
): ChatMessage {
  const metadata = backendMsg.metadata ?? {};
  const thinking =
    typeof metadata.thinking === "string" ? metadata.thinking : undefined;
  const runStatus =
    typeof metadata.run_status === "string" ? metadata.run_status : undefined;
  const runId = backendMsg.run_id ?? undefined;
  const runErrorRaw =
    typeof metadata.run_error === "string"
      ? metadata.run_error
      : typeof metadata.error === "string"
        ? metadata.error
        : typeof metadata.error_message === "string"
          ? metadata.error_message
          : undefined;
  const runErrorCode =
    typeof metadata.error_code === "string" ? metadata.error_code : undefined;
  const lastEventSeq =
    typeof metadata.last_event_seq === "number" ? metadata.last_event_seq : undefined;
  const inFlight = metadata.in_flight_tools;
  const toolRecords = [
    ...(Array.isArray(metadata.tools_executed) ? metadata.tools_executed : [])
      .map((tool) => ({ tool, isRunning: false })),
    ...(inFlight && typeof inFlight === "object" ? Object.values(inFlight) : [])
      .map((tool) => ({ tool, isRunning: true })),
  ];
  // Keep launch order after reload; completed tasks must not jump above their siblings.
  toolRecords.sort((a, b) => {
    const sequence = (value: unknown) => value && typeof value === "object" && "start_sequence" in value && typeof value.start_sequence === "number"
      ? value.start_sequence : Number.MAX_SAFE_INTEGER;
    return sequence(a.tool) - sequence(b.tool);
  });
  const tools = toolRecords.length
    ? toolRecords
        .map(({ tool, isRunning }): ToolInfo | null => {
          if (!tool || typeof tool !== "object") return null;
          const t = tool as Record<string, unknown>;
          const interrupted = isRunning && ["cancelled", "failed", "completed"].includes(runStatus ?? "");
          const originalToolName = typeof t.tool_name === "string" ? t.tool_name : "";
          const inputData = typeof t.input === "object" && t.input !== null
                ? (t.input as Record<string, unknown>)
                : undefined;
          return {
            toolName: formatDisplayToolName(originalToolName, inputData),
            toolCallId: typeof t.tool_call_id === "string" ? t.tool_call_id : "",
            ...(isRunning && !interrupted ? { isRunning: true } : {}),
            inputData,
            result: interrupted
              ? (runStatus === "cancelled" ? "執行已取消，工具未完成" : runErrorRaw ?? "執行已結束，工具未完成")
              : typeof t.result === "string" ||
              (typeof t.result === "object" && t.result !== null)
                ? (t.result as string | Record<string, unknown>)
                : undefined,
            isError: interrupted ? true : typeof t.is_error === "boolean" ? t.is_error : undefined,
            ...(typeof t.parent_tool_call_id === "string"
              ? { parentToolCallId: t.parent_tool_call_id }
              : {}),
          };
        })
        .filter((t): t is ToolInfo => t !== null)
    : undefined;
  const todoItems = normalizeTodoItems(metadata.todos) ?? normalizeTodoItems(metadata.todo_items);
  const rawOptions = Array.isArray(metadata.next_turn_options) ? metadata.next_turn_options : undefined;
  const nextTurnOptions = rawOptions
    ?.filter((o): o is Record<string, unknown> => typeof o === "object" && o !== null && "label" in o && "message" in o)
    .map((o) => ({ label: String(o.label), message: String(o.message) }));

  return {
    id: `${sessionId}:${backendMsg.ordinal}`,
    role: backendMsg.role as "user" | "assistant",
    content: backendMsg.content,
    timestamp: new Date(backendMsg.created_at),
    thinkingInfo: thinking ? { thinking, signature: "" } : undefined,
    toolExecutions: tools,
    todoItems,
    nextTurnOptions: nextTurnOptions?.length ? nextTurnOptions : undefined,
    runId,
    runStatus: runStatus as ChatMessage["runStatus"],
    runError:
      runStatus === "failed" ? toRunFailureMessage(runErrorCode, runErrorRaw) : undefined,
    lastEventSeq,
    isThinking: runStatus === "queued" || runStatus === "running",
  };
}

export function convertBackendRun(run: BackendRun): ChatRun {
  return {
    id: run.run_id,
    sessionId: run.session_id,
    status: run.status,
    kind: run.kind,
    modelId: run.model_id,
    lastEventSeq: run.last_sequence,
    approvalPayload: run.status === "awaiting_approval" ? run.pause_payload : undefined,
    questionPayload: run.status === "awaiting_user_answer" ? run.pause_payload : undefined,
    error: run.error_message,
  };
}
