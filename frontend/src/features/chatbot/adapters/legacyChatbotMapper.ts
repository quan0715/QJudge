import type { ChatMessage, ChatRun, ChatSession } from "@/core/types/chatbot.types";
import type { CopilotMessage, CopilotRunState, CopilotSession } from "@/core/copilot";
import { mapCopilotRunToChat } from "@/infrastructure/copilot/chatbotCopilotMapper";

export function mapCopilotMessageToLegacy(message: CopilotMessage): ChatMessage {
  const text = message.parts.filter((part) => part.type === "text").map((part) => part.text).join("");
  const reasoning = message.parts.find((part) => part.type === "reasoning");
  return {
    id: message.id,
    role: message.role,
    content: text,
    timestamp: message.createdAt,
    thinkingInfo: reasoning?.type === "reasoning" ? { thinking: reasoning.text, signature: "" } : undefined,
    toolExecutions: message.parts.filter((part) => part.type === "tool").map((part) => ({ toolCallId: part.toolCallId, toolName: part.toolName, inputData: part.input, result: part.output, isError: part.state === "error" })),
  };
}

export function mapCopilotSessionToLegacy(session: CopilotSession): ChatSession {
  return { id: session.id, title: session.title, createdAt: session.createdAt, updatedAt: session.updatedAt, messages: session.messages.map(mapCopilotMessageToLegacy), context: session.metadata };
}

export function mapCopilotRunStateToLegacy(state: CopilotRunState): ChatRun[] {
  return state.status === "ready" || !state.run ? [] : [mapCopilotRunToChat(state.run)];
}
