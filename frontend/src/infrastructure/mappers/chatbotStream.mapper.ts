import type {
  ChatMessage,
  ChatSession,
  RunTodoItem,
  StreamCallbacks,
  SubagentActivity,
  ToolInfo,
  VerificationReport,
} from "@/core/types/chatbot.types";
import type { V2StreamEvent } from "@/infrastructure/api/dto/chatbot.dto";
import {
  extractTodoCommands,
  formatDisplayToolName,
  normalizeTodoItems,
  toRunFailureMessage,
} from "./chatbot.mapper";

const TODO_TOOL_NAMES = new Set(["write_todos", "update_todos"]);
const hiddenTodoToolNames = new WeakMap<object, string>();
const formattedToolNames = new Map<string, string>();
const pendingToolInputs = new Map<string, Record<string, unknown>>();

function isActiveRunStatus(status: ChatMessage["runStatus"] | undefined): boolean {
  return status === "queued" || status === "running";
}

function applyRunStatusToCurrentMessage(
  event: V2StreamEvent,
  currentMessage: Partial<ChatMessage>,
): void {
  const runStatus = event.run_status as ChatMessage["runStatus"] | undefined;
  if (runStatus) {
    currentMessage.runStatus = runStatus;
    currentMessage.isThinking = isActiveRunStatus(runStatus);
    return;
  }

  if (event.type === "run_started") {
    currentMessage.isThinking = true;
    return;
  }

  if (
    event.type === "run_completed"
    || event.type === "run_failed"
    || event.type === "run_cancelled"
    || event.type === "awaiting_approval"
  ) {
    currentMessage.isThinking = false;
  }
}

function isTodoToolName(toolName: string | undefined): boolean {
  return !!toolName && TODO_TOOL_NAMES.has(toolName);
}

function updateSubagentActivity(
  message: Partial<ChatMessage>,
  parentToolCallId: string,
  patch: Partial<SubagentActivity>,
): void {
  const previous = message.subagentActivity?.[parentToolCallId] ?? { text: "" };
  message.subagentActivity = {
    ...message.subagentActivity,
    [parentToolCallId]: { ...previous, ...patch },
  };
}

function extractTodoItemsFromEvent(event: V2StreamEvent): RunTodoItem[] | undefined {
  const inputData = event.input_data;
  const result = event.result;

  return (
    normalizeTodoItems(event.todos) ??
    normalizeTodoItems(event.todo_items) ??
    normalizeTodoItems(inputData?.todos) ??
    normalizeTodoItems(inputData?.todo_items) ??
    (typeof result === "string" ? extractTodoCommands(result).todoItems : undefined) ??
    (typeof result === "object" && result !== null
      ? normalizeTodoItems((result as Record<string, unknown>).todos) ??
        normalizeTodoItems((result as Record<string, unknown>).todo_items)
      : undefined)
  );
}

/** Handle a single SSE event. */
export function handleChatStreamEvent(
  this: { getSession(sessionId: string): Promise<ChatSession> },
  event: V2StreamEvent,
  currentMessage: Partial<ChatMessage>,
  callbacks: StreamCallbacks,
  resolvedSessionId: string,
) {
  const resumeSequence =
    typeof event.seq === "number" ? event.seq : undefined;
  if (resumeSequence !== undefined) currentMessage.lastEventSeq = resumeSequence;
  const notify = <Value>(
    callback:
      | ((value: Value, callbackResumeSequence?: number) => void)
      | undefined,
    value: Value,
  ) => {
    if (resumeSequence === undefined) callback?.(value);
    else callback?.(value, resumeSequence);
  };
  applyRunStatusToCurrentMessage(event, currentMessage);

  const parentToolCallId = event.parent_tool_call_id;
  const todoItems = extractTodoItemsFromEvent(event);
  if (todoItems && parentToolCallId) {
    updateSubagentActivity(currentMessage, parentToolCallId, { todoItems });
  } else if (todoItems) {
    currentMessage.todoItems = todoItems;
    notify(callbacks.onTodoItemsUpdate, todoItems);
  }

  if (
    parentToolCallId &&
    (event.type === "agent_message_delta" || event.type === "thinking_delta")
  ) {
    // Subagent prose belongs to its task card, never to the main reply.
    if (event.type === "agent_message_delta" && event.content) {
      const previous = currentMessage.subagentActivity?.[parentToolCallId]?.text ?? "";
      updateSubagentActivity(currentMessage, parentToolCallId, {
        text: previous + event.content,
      });
      notify(callbacks.onMessageUpdate, { ...currentMessage });
    }
    return;
  }

  switch (event.type) {
    // ===== v2 Events =====
    case "run_started":
      console.debug("SSE: run_started", { runId: event.run_id });
      break;

    case "summarization_started": {
      notify(callbacks.onSessionNotice, "對話過長，截取摘要中");
      break;
    }

    case "summarization_ended": {
      notify(callbacks.onSessionNotice, null);
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
          notify(callbacks.onTodoItemsUpdate, commandResult.todoItems);
        }
        const messageUpdate = { ...currentMessage } as Partial<ChatMessage> & {
          rawAgentContent?: string;
        };
        delete messageUpdate.rawAgentContent;
        notify(callbacks.onMessageUpdate, messageUpdate);
      }
      break;

    case "thinking_delta":
      if (event.content) {
        const prevThinking = currentMessage.thinkingInfo?.thinking || "";
        currentMessage.thinkingInfo = {
          thinking: prevThinking + event.content,
          signature: "",
        };
        notify(callbacks.onMessageUpdate, { ...currentMessage });
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
      notify(callbacks.onVerificationReport, report);
      notify(callbacks.onMessageUpdate, { ...currentMessage });
      break;
    }

    case "tool_call_started":
      if (event.tool_name) {
        if (isTodoToolName(event.tool_name)) {
          hiddenTodoToolNames.set(currentMessage, event.tool_name);
          break;
        }

        const displayToolName = formatDisplayToolName(event.tool_name, event.input_data);
        if (event.tool_call_id) {
          formattedToolNames.set(event.tool_call_id, displayToolName);
          if (event.input_data) {
            pendingToolInputs.set(event.tool_call_id, event.input_data);
          }
        }

        if (!parentToolCallId) currentMessage.toolName = displayToolName;
        notify(callbacks.onToolStarted, {
          toolName: displayToolName,
          ...(event.tool_call_id ? { toolCallId: event.tool_call_id } : {}),
          ...(event.input_data ? { inputData: event.input_data } : {}),
          ...(parentToolCallId ? { parentToolCallId } : {}),
        });
        notify(callbacks.onMessageUpdate, { ...currentMessage });
      }
      break;

    case "tool_call_finished": {
      const hiddenTodoToolName = hiddenTodoToolNames.get(currentMessage);
      const originalToolName = event.tool_name || "";
      const toolCallId = event.tool_call_id || originalToolName;

      let toolName = originalToolName;
      if (event.tool_call_id && formattedToolNames.has(event.tool_call_id)) {
        toolName = formattedToolNames.get(event.tool_call_id)!;
        formattedToolNames.delete(event.tool_call_id);
      } else if (!event.tool_name && currentMessage.toolName) {
        toolName = currentMessage.toolName;
      } else if (!toolName) {
        toolName = currentMessage.toolName || hiddenTodoToolName || "";
      }

      if (isTodoToolName(originalToolName) || isTodoToolName(toolName) || isTodoToolName(hiddenTodoToolName)) {
        hiddenTodoToolNames.delete(currentMessage);
        currentMessage.toolName = undefined;
        break;
      }

      let inputData: Record<string, unknown> | undefined;
      if (event.tool_call_id && pendingToolInputs.has(event.tool_call_id)) {
        inputData = pendingToolInputs.get(event.tool_call_id);
        pendingToolInputs.delete(event.tool_call_id);
      }

      const toolInfo: ToolInfo = {
        toolName,
        toolCallId,
        inputData,
        result: event.result,
        isError: event.is_error,
        ...(parentToolCallId ? { parentToolCallId } : {}),
      };
      currentMessage.toolExecutions = [
        ...(currentMessage.toolExecutions || []),
        toolInfo,
      ];
      if (!parentToolCallId) currentMessage.toolName = undefined;
      notify(callbacks.onMessageUpdate, { ...currentMessage });
      break;
    }

    case "usage_report":
      console.debug("SSE: usage_report", {
        inputTokens: event.input_tokens,
        outputTokens: event.output_tokens,
        modelUsed: event.model_used,
      });
      break;

    case "run_completed": {
      console.debug("SSE: run_completed", { runId: event.run_id });
      notify(callbacks.onRunStatus, "completed");
      notify(callbacks.onSessionNotice, null);
      notify(callbacks.onTodoItemsUpdate, null);
      if (event.next_turn_options?.length) {
        notify(
          callbacks.onNextTurnOptions,
          event.next_turn_options.map((o) => ({
            label: o.label,
            message: o.message,
          })),
        );
      }
      // Fetch fresh session
      this.getSession(resolvedSessionId)
        .then((freshSession: ChatSession) =>
          notify(callbacks.onComplete, freshSession),
        )
        .catch((err: Error) => {
          console.warn("Failed to fetch session after run_completed:", err);
          notify(callbacks.onError, "對話同步失敗，請重新整理後再試");
        });
      break;
    }

    case "run_cancelled": {
      console.debug("SSE: run_cancelled", { runId: event.run_id });
      notify(callbacks.onRunStatus, "cancelled");
      notify(callbacks.onSessionNotice, null);
      notify(callbacks.onTodoItemsUpdate, null);
      this.getSession(resolvedSessionId)
        .then((freshSession: ChatSession) =>
          notify(callbacks.onComplete, freshSession),
        )
        .catch((err: Error) => {
          console.warn("Failed to fetch session after run_cancelled:", err);
          notify(callbacks.onError, "對話同步失敗，請重新整理後再試");
        });
      break;
    }

    case "run_failed": {
      console.debug("SSE: run_failed", {
        errorCode: event.error_code,
        message: event.message,
      });
      const runFailureMessage = toRunFailureMessage(
        event.error_code,
        event.message,
      );
      currentMessage.runStatus = "failed";
      notify(callbacks.onRunStatus, "failed");
      currentMessage.isThinking = false;
      currentMessage.runError = runFailureMessage;
      notify(callbacks.onMessageUpdate, { ...currentMessage });
      notify(callbacks.onSessionNotice, null);
      notify(callbacks.onTodoItemsUpdate, null);
      this.getSession(resolvedSessionId)
        .then((freshSession: ChatSession) =>
          notify(callbacks.onComplete, freshSession),
        )
        .catch((err: Error) => {
          console.warn("Failed to fetch session after run_failed:", err);
          notify(callbacks.onError, "對話同步失敗，請重新整理後再試");
        });
      break;
    }

    case "awaiting_approval": {
      // Run may pause for a long time before run_completed; clear transient notices (e.g. summarization).
      notify(callbacks.onSessionNotice, null);
      notify(callbacks.onRunStatus, "awaiting_approval");
      if (event.action_requests?.length) {
        notify(callbacks.onAwaitingApproval, {
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

    case "awaiting_user_answer": {
      notify(callbacks.onSessionNotice, null);
      notify(callbacks.onRunStatus, "awaiting_user_answer");
      if (event.question) {
        notify(callbacks.onAwaitingUserAnswer, {
          question: event.question,
          options: event.options,
          inputType: (event.input_type as "text" | "choice") ?? "text",
        });
      }
      break;
    }

    default:
      if (!todoItems) {
        console.debug("SSE: unknown event type", { type: event.type });
      }
  }
}
