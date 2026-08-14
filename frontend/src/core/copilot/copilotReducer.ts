import type { CopilotRunEvent } from "./copilotEvent.types";
import type {
  CopilotError,
  CopilotMessage,
  CopilotMessagePart,
  CopilotRun,
  CopilotRunState,
  CopilotSession,
} from "./copilot.types";

export interface CopilotRuntimeState {
  sessions: Record<string, CopilotSession>;
  activeSessionId: string | null;
  runs: Record<string, CopilotRunState>;
  lastSequenceByRun: Record<string, number>;
  lastResumeSequenceByRun: Record<string, number>;
}

export function createCopilotRuntimeState(): CopilotRuntimeState {
  return {
    sessions: {},
    activeSessionId: null,
    runs: {},
    lastSequenceByRun: {},
    lastResumeSequenceByRun: {},
  };
}

function getRun(state: CopilotRunState | undefined): CopilotRun | null {
  if (!state || state.status === "ready") return null;
  return state.run;
}

function replaceRun(
  state: CopilotRunState,
  run: CopilotRun,
): CopilotRunState {
  switch (state.status) {
    case "ready":
      return run.status === "queued"
        ? { status: "submitted", run }
        : { status: "streaming", run };
    case "submitted":
    case "streaming":
      return { ...state, run };
    case "awaiting-approval":
    case "awaiting-answer":
      return { ...state, run };
    case "error":
      return { ...state, run };
  }
}

function updateMessage(
  session: CopilotSession,
  messageId: string,
  update: (message: CopilotMessage) => CopilotMessage,
): CopilotSession | null {
  const messageIndex = session.messages.findIndex(
    (message) => message.id === messageId,
  );
  if (messageIndex < 0) return null;

  const messages = [...session.messages];
  messages[messageIndex] = update(messages[messageIndex]);
  return { ...session, messages };
}

function appendDelta(
  message: CopilotMessage,
  partType: "text" | "reasoning",
  delta: string,
): CopilotMessage {
  const partIndex = message.parts.findIndex((part) => part.type === partType);
  const parts = [...message.parts];

  if (partIndex < 0) {
    parts.push(
      partType === "text"
        ? { type: "text", text: delta }
        : { type: "reasoning", text: delta, state: "streaming" },
    );
  } else {
    const part = parts[partIndex];
    if (part.type === "text") {
      parts[partIndex] = { ...part, text: `${part.text}${delta}` };
    } else if (part.type === "reasoning") {
      parts[partIndex] = { ...part, text: `${part.text}${delta}` };
    }
  }

  return { ...message, parts };
}

function upsertPart(
  message: CopilotMessage,
  incoming: CopilotMessagePart,
): CopilotMessage {
  const parts = [...message.parts];
  const partIndex =
    incoming.type === "tool"
      ? parts.findIndex(
          (part) =>
            part.type === "tool" && part.toolCallId === incoming.toolCallId,
        )
      : -1;

  if (partIndex < 0) {
    parts.push(incoming);
  } else {
    parts[partIndex] = incoming;
  }
  return { ...message, parts };
}

function defaultRunError(): CopilotError {
  return {
    code: "run-failed",
    operation: "subscribe-run",
    recoverable: false,
  };
}

function withRunNotice(run: CopilotRun, notice: string | null): CopilotRun {
  if (notice !== null) {
    return { ...run, metadata: { ...run.metadata, notice } };
  }
  if (!run.metadata || !("notice" in run.metadata)) return run;
  const { notice: _notice, ...metadata } = run.metadata;
  return {
    ...run,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

function withoutRunNotice(run: CopilotRun): CopilotRun {
  return withRunNotice(run, null);
}

function transitionRunStatus(
  current: CopilotRunState,
  run: CopilotRun,
  event: Extract<CopilotRunEvent, { type: "run-status" }>,
): CopilotRunState {
  if (event.status === "completed" || event.status === "cancelled") {
    return { status: "ready", run: null };
  }
  if (event.status === "failed") {
    return {
      status: "error",
      run,
      error: event.error ?? defaultRunError(),
    };
  }
  if (event.status === "queued") {
    return { status: "submitted", run };
  }
  if (event.status === "running") {
    return { status: "streaming", run };
  }
  return replaceRun(current, run);
}

export function reduceCopilotEvent(
  state: CopilotRuntimeState,
  event: CopilotRunEvent,
): CopilotRuntimeState {
  const session = state.sessions[event.sessionId];
  const currentRunState = state.runs[event.sessionId];
  const currentRun = getRun(currentRunState);
  if (!session || !currentRunState || currentRun?.id !== event.runId) {
    return state;
  }

  const lastSequence = state.lastSequenceByRun[event.runId] ?? -1;
  if (event.sequence <= lastSequence) return state;

  const lastResumeSequence =
    state.lastResumeSequenceByRun[event.runId] ?? currentRun.lastSequence ?? -1;
  const nextResumeSequence =
    typeof event.resumeSequence === "number"
      ? Math.max(lastResumeSequence, event.resumeSequence)
      : lastResumeSequence;
  const nextRun: CopilotRun = {
    ...currentRun,
    lastSequence:
      nextResumeSequence >= 0 ? nextResumeSequence : currentRun.lastSequence,
  };
  let nextSession = session;
  let nextRunState = replaceRun(currentRunState, nextRun);

  switch (event.type) {
    case "text-delta":
    case "reasoning-delta": {
      const updated = updateMessage(session, event.messageId, (message) =>
        appendDelta(
          message,
          event.type === "text-delta" ? "text" : "reasoning",
          event.delta,
        ),
      );
      if (!updated) return state;
      nextSession = updated;
      break;
    }
    case "part-upsert": {
      const updated = updateMessage(session, event.messageId, (message) =>
        upsertPart(message, event.part),
      );
      if (!updated) return state;
      nextSession = updated;
      break;
    }
    case "awaiting-approval": {
      const awaitingRun = {
        ...nextRun,
        status: "awaiting-approval" as const,
      };
      nextRunState = {
        status: "awaiting-approval",
        run: awaitingRun,
        request: event.request,
      };
      break;
    }
    case "awaiting-answer": {
      const awaitingRun = {
        ...nextRun,
        status: "awaiting-answer" as const,
      };
      nextRunState = {
        status: "awaiting-answer",
        run: awaitingRun,
        request: event.request,
      };
      break;
    }
    case "run-notice": {
      nextRunState = replaceRun(
        currentRunState,
        withRunNotice(nextRun, event.notice),
      );
      break;
    }
    case "run-status": {
      const statusRun = {
        ...(event.status === "completed" ||
        event.status === "failed" ||
        event.status === "cancelled"
          ? withoutRunNotice(nextRun)
          : nextRun),
        status: event.status,
      };
      nextRunState = transitionRunStatus(currentRunState, statusRun, event);
      break;
    }
  }

  return {
    ...state,
    sessions:
      nextSession === session
        ? state.sessions
        : { ...state.sessions, [event.sessionId]: nextSession },
    runs: { ...state.runs, [event.sessionId]: nextRunState },
    lastSequenceByRun: {
      ...state.lastSequenceByRun,
      [event.runId]: event.sequence,
    },
    lastResumeSequenceByRun: {
      ...state.lastResumeSequenceByRun,
      ...(nextResumeSequence >= 0
        ? { [event.runId]: nextResumeSequence }
        : {}),
    },
  };
}
