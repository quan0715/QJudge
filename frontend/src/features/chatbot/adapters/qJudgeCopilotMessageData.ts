import type { CopilotMessage } from "@copilot";
import type { TodoListItem } from "@/shared/ai/TodoList";

export interface QJudgeNextTurnOption {
  label: string;
  message: string;
}

const todoStatuses: ReadonlySet<string> = new Set([
  "pending",
  "in_progress",
  "success",
  "fail",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTodoListItem(value: unknown): value is TodoListItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.status === "string" &&
    todoStatuses.has(value.status)
  );
}

function parseTodoItems(value: unknown): readonly TodoListItem[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.filter(isTodoListItem);
  return value.length === 0 || items.length > 0 ? items : null;
}

function isNextTurnOption(value: unknown): value is QJudgeNextTurnOption {
  return (
    isRecord(value) &&
    typeof value.label === "string" &&
    typeof value.message === "string"
  );
}

function parseNextTurnOptions(value: unknown): readonly QJudgeNextTurnOption[] | null {
  if (!Array.isArray(value)) return null;
  const options = value.filter(isNextTurnOption);
  return value.length === 0 || options.length > 0 ? options : null;
}

function selectLatestData<T>(
  messages: readonly CopilotMessage[],
  type: `data-${string}`,
  parse: (value: unknown) => readonly T[] | null,
): readonly T[] {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message?.role !== "assistant") continue;

    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex];
      if (part?.type !== type || !("data" in part)) continue;
      const parsed = parse(part.data);
      if (parsed !== null) return parsed;
    }
  }
  return [];
}

export function selectLatestTodoItems(
  messages: readonly CopilotMessage[],
): readonly TodoListItem[] {
  return selectLatestData(messages, "data-todo-items", parseTodoItems);
}

export function selectLatestNextTurnOptions(
  messages: readonly CopilotMessage[],
): readonly QJudgeNextTurnOption[] {
  return selectLatestData(
    messages,
    "data-next-turn-options",
    parseNextTurnOptions,
  );
}

export function selectFinishedArtifactToolIds(
  messages: readonly CopilotMessage[],
): readonly string[] {
  const ids: string[] = [];
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message?.role !== "assistant") continue;

    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex];
      if (
        part?.type === "tool" &&
        typeof part.toolName === "string" &&
        typeof part.toolCallId === "string" &&
        part.toolName.startsWith("artifact_") &&
        (part.state === "output-ready" || part.state === "error")
      ) {
        ids.push(part.toolCallId);
      }
    }
  }
  return ids;
}
