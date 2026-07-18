import type {
  ChatMessage,
  ChatRun,
  ChatSession,
  ToolInfo,
  VerificationReport,
} from "@/core/types/chatbot.types";

export interface StreamedRunState {
  content: string;
  thinking: string;
}

function appendSubscriptionDelta(previous: string, next: string | undefined) {
  if (typeof next !== "string") {
    return { nextStreamValue: previous, delta: undefined };
  }
  const delta = next.startsWith(previous) ? next.slice(previous.length) : next;
  return { nextStreamValue: next, delta };
}

function mergeStreamedText(existing: string, streamedValue: string, delta?: string) {
  if (!delta) return existing;
  if (!existing) return streamedValue;
  if (streamedValue.startsWith(existing)) return streamedValue;
  if (existing.startsWith(streamedValue)) return existing;
  return `${existing}${delta}`;
}

function mergeToolExecutions(
  previous: ToolInfo[] | undefined,
  incoming: ToolInfo[] | undefined,
): ToolInfo[] | undefined {
  if (!incoming?.length) return previous;
  if (!previous?.length) return incoming;
  const incomingById = new Map<string, ToolInfo>();
  for (const execution of incoming) {
    if (execution.toolCallId) incomingById.set(execution.toolCallId, execution);
  }
  const merged: ToolInfo[] = [];
  const usedIds = new Set<string>();
  for (const execution of previous) {
    const id = execution.toolCallId;
    const replacement = id ? incomingById.get(id) : undefined;
    if (replacement && id) {
      merged.push(replacement);
      usedIds.add(id);
    } else {
      merged.push(execution);
    }
  }
  for (const execution of incoming) {
    if (execution.toolCallId && usedIds.has(execution.toolCallId)) continue;
    merged.push(execution);
  }
  return merged;
}

function mergeVerificationReports(
  previous: VerificationReport[] | undefined,
  incoming: VerificationReport[] | undefined,
): VerificationReport[] | undefined {
  if (!incoming?.length) return previous;
  if (!previous?.length) return incoming;
  const incomingByIteration = new Map(
    incoming.map((report) => [report.iteration, report]),
  );
  const merged: VerificationReport[] = [];
  const usedIterations = new Set<number>();
  for (const report of previous) {
    const replacement = incomingByIteration.get(report.iteration);
    if (replacement) {
      merged.push(replacement);
      usedIterations.add(report.iteration);
    } else {
      merged.push(report);
    }
  }
  for (const report of incoming) {
    if (usedIterations.has(report.iteration)) continue;
    merged.push(report);
  }
  return merged;
}

function createAssistantDraft(
  run: ChatRun,
  messageUpdate: Partial<ChatMessage>,
): ChatMessage {
  return {
    id: String(run.assistantMessageId ?? `run-${run.id}-assistant`),
    role: "assistant",
    content: "",
    timestamp: new Date(),
    runId: run.id,
    runStatus: run.status,
    isThinking: run.status === "queued" || run.status === "running",
    ...messageUpdate,
  };
}

export function applyRunMessageUpdate(
  session: ChatSession,
  run: ChatRun,
  messageUpdate: Partial<ChatMessage>,
  streamedState: StreamedRunState,
): ChatSession {
  const assistantMessageId = String(
    run.assistantMessageId ?? `run-${run.id}-assistant`,
  );
  const contentDelta = appendSubscriptionDelta(
    streamedState.content,
    messageUpdate.content,
  );
  streamedState.content = contentDelta.nextStreamValue;

  const nextThinking = messageUpdate.thinkingInfo?.thinking;
  const thinkingDelta = appendSubscriptionDelta(
    streamedState.thinking,
    nextThinking,
  );
  streamedState.thinking = thinkingDelta.nextStreamValue;

  let didUpdateExistingDraft = false;
  const messages = session.messages.map((message) => {
    if (message.role !== "assistant") return message;
    if (message.id !== assistantMessageId && message.runId !== run.id) return message;
    didUpdateExistingDraft = true;

    const mergedThinking = messageUpdate.thinkingInfo
      ? {
          ...messageUpdate.thinkingInfo,
          thinking: mergeStreamedText(
            message.thinkingInfo?.thinking ?? "",
            streamedState.thinking,
            thinkingDelta.delta,
          ),
        }
      : message.thinkingInfo;

    return {
      ...message,
      ...messageUpdate,
      content: mergeStreamedText(
        message.content,
        streamedState.content,
        contentDelta.delta,
      ),
      thinkingInfo: mergedThinking,
      toolExecutions: mergeToolExecutions(
        message.toolExecutions,
        messageUpdate.toolExecutions,
      ),
      verificationReports: mergeVerificationReports(
        message.verificationReports,
        messageUpdate.verificationReports,
      ),
      runId: message.runId ?? run.id,
      runStatus: messageUpdate.runStatus ?? run.status,
      lastEventSeq: messageUpdate.lastEventSeq ?? message.lastEventSeq,
      todoItems: messageUpdate.todoItems ?? message.todoItems,
    };
  });

  if (!didUpdateExistingDraft) {
    messages.push(createAssistantDraft(run, messageUpdate));
  }

  return {
    ...session,
    messages,
  };
}
