import type {
  ChatMessage,
  ChatRun,
  ChatRunStatus,
  ChatSession,
  ToolInfo,
} from "@/core/types/chatbot.types";
import type {
  CopilotAttachmentPart,
  CopilotError,
  CopilotMessage,
  CopilotMessagePart,
  CopilotRun,
  CopilotRunStatus,
  CopilotSession,
  CopilotSessionSummary,
  CopilotToolPart,
} from "@/core/copilot";
import type { ArtifactRecord } from "@/infrastructure/api/repositories/artifact.repository";

export function mapChatRunStatusToCopilot(
  status: ChatRunStatus,
): CopilotRunStatus {
  if (status === "awaiting_approval") return "awaiting-approval";
  if (status === "awaiting_user_answer") return "awaiting-answer";
  return status;
}

export function mapCopilotRunStatusToChat(
  status: CopilotRunStatus,
): ChatRunStatus {
  if (status === "awaiting-approval") return "awaiting_approval";
  if (status === "awaiting-answer") return "awaiting_user_answer";
  return status;
}

export function mapToolInfoToCopilotPart(
  tool: ToolInfo,
  index: number,
): CopilotToolPart {
  const state = tool.isError
    ? "error"
    : tool.result !== undefined
      ? "output-ready"
      : "input-ready";
  return {
    type: "tool",
    toolCallId: tool.toolCallId ?? `legacy-tool-${index}-${tool.toolName}`,
    toolName: tool.toolName,
    state,
    input: tool.inputData,
    output: tool.result,
    error: tool.isError
      ? {
          code: "run-failed",
          operation: "subscribe-run",
          message:
            typeof tool.result === "string" ? tool.result : "Tool execution failed",
          recoverable: false,
        }
      : undefined,
  };
}

export function mapChatMessageToCopilot(message: ChatMessage): CopilotMessage {
  const parts: CopilotMessagePart[] = [];
  if (message.content) parts.push({ type: "text", text: message.content });
  if (message.thinkingInfo?.thinking) {
    parts.push({
      type: "reasoning",
      text: message.thinkingInfo.thinking,
      state: message.isThinking ? "streaming" : "complete",
    });
  }
  for (const [index, tool] of (message.toolExecutions ?? []).entries()) {
    parts.push(mapToolInfoToCopilotPart(tool, index));
  }
  if (message.todoItems) {
    parts.push({ type: "data-todos", data: message.todoItems });
  }
  if (message.verificationReports) {
    parts.push({
      type: "data-verification",
      data: message.verificationReports,
    });
  }
  if (message.nextTurnOptions) {
    parts.push({ type: "data-next-turn-options", data: message.nextTurnOptions });
  }

  return {
    id: message.id,
    role: message.role,
    parts,
    createdAt: new Date(message.timestamp),
  };
}

export function mapChatSessionToCopilot(session: ChatSession): CopilotSession {
  return {
    id: session.id,
    title: session.title,
    createdAt: new Date(session.createdAt),
    updatedAt: new Date(session.updatedAt),
    metadata: session.context ? { ...session.context } : undefined,
    messages: session.messages.map(mapChatMessageToCopilot),
  };
}

export function mapChatSessionToCopilotSummary(
  session: ChatSession,
): CopilotSessionSummary {
  const mapped = mapChatSessionToCopilot(session);
  const { messages: _messages, ...summary } = mapped;
  return summary;
}

export function mapChatRunToCopilot(run: ChatRun): CopilotRun {
  const question = run.questionPayload?.question;
  return {
    id: run.id,
    sessionId: run.sessionId,
    status: mapChatRunStatusToCopilot(run.status),
    modelId: run.modelId || undefined,
    lastSequence: run.lastEventSeq,
    questionRequest:
      typeof question === "string" && question.length > 0
        ? {
            question,
            input: run.questionPayload?.input_type === "choice" ? "choice" : "text",
            options: run.questionPayload?.options,
          }
        : undefined,
  };
}

export function mapCopilotRunToChat(run: CopilotRun): ChatRun {
  return {
    id: run.id,
    sessionId: run.sessionId,
    status: mapCopilotRunStatusToChat(run.status),
    kind: "chat",
    modelId: run.modelId ?? "",
    lastEventSeq: run.lastSequence ?? 0,
  };
}

export function mapArtifactRecordToCopilotAttachment(
  artifact: ArtifactRecord,
): CopilotAttachmentPart {
  return {
    type: "attachment",
    id: artifact.id,
    name: artifact.filename,
    mediaType: artifact.content_type || undefined,
  };
}

export function mapQJudgeError(
  operation: CopilotError["operation"],
  cause: unknown,
  overrides: Partial<Pick<CopilotError, "code" | "recoverable">> = {},
): Error & CopilotError {
  const message = cause instanceof Error ? cause.message : String(cause);
  return Object.assign(new Error(message), {
    code: overrides.code ?? "transport-error",
    operation,
    recoverable: overrides.recoverable ?? true,
    cause,
  });
}
