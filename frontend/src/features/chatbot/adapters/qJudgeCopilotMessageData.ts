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

/**
 * The latest run's subagents with their live status. A parent agent waiting on
 * parallel subagents cannot update its todos, so this follows the tool calls instead.
 */
export function selectLatestSubagentItems(messages: readonly CopilotMessage[]): readonly TodoListItem[] {
  for (const message of [...messages].reverse()) {
    if (message.role !== "assistant") continue;
    const tasks = message.parts.flatMap((part) =>
      part.type === "tool" && part.toolName === "task" && !part.parentToolCallId ? [part] : [],
    );
    if (!tasks.length) continue;
    return tasks.map((part) => {
      const description = isRecord(part.input) && typeof part.input.description === "string" ? part.input.description : "";
      return {
        id: part.toolCallId,
        label: description.split("\n")[0].trim() || part.toolName,
        status: part.state === "output-ready" ? "success" : part.state === "error" ? "fail" : "in_progress",
      };
    });
  }
  return [];
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

// Keep read-only tools and grading submission out of artifact-list invalidation.
const ARTIFACT_MUTATION_TOOLS = new Set([
  "artifact_write",
  "artifact_write_csv",
  "artifact_csv_from_json",
  "artifact_csv_patch",
]);

export function isArtifactMutationTool(toolName: string): boolean {
  return ARTIFACT_MUTATION_TOOLS.has(toolName);
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
        isArtifactMutationTool(part.toolName) &&
        (part.state === "output-ready" || part.state === "error")
      ) {
        ids.push(part.toolCallId);
      }
    }
  }
  return ids;
}

/** A batch request's first line names its units for the worker; people read the rest. */
export function batchKickoffDisplayText(text: string): string {
  if (!text.startsWith("batch_units: ")) return text;
  return text.split("\n").slice(1).join("\n").trim() || text;
}
