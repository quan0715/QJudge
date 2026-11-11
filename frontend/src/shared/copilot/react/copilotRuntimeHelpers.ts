import type {
  reduceCopilotEvent,
  CopilotError,
  CopilotModel,
  CopilotRun,
  CopilotRunState,
  CopilotRuntimeState,
  CopilotSessionSummary,
  CopilotStorage,
} from "@/core/copilot";

export const LAST_SESSION_KEY = "copilot:last-session-id";
export const LAST_MODEL_KEY = "copilot:last-model-id";
const OWNER_KEY = "copilot:owner";

/** Whether persisted selections may be read for this owner. */
export const isStorageOwnedBy = (
  storage: CopilotStorage | undefined,
  ownerKey: string | null | undefined,
): boolean =>
  ownerKey === undefined || storage?.get(OWNER_KEY) === ownerKey;

/** Drops selections persisted by a different owner, then records the new one. */
export const claimStorage = (
  storage: CopilotStorage | undefined,
  ownerKey: string | null | undefined,
): void => {
  if (!storage || ownerKey === undefined) return;
  if (storage.get(OWNER_KEY) === ownerKey) return;
  storage.remove(LAST_SESSION_KEY);
  storage.remove(LAST_MODEL_KEY);
  if (ownerKey === null) storage.remove(OWNER_KEY);
  else storage.set(OWNER_KEY, ownerKey);
};
export const ACTIVE_RUN_ID_KEY = "activeRunId";
export const ACTIVE_RUN_STATUS_KEY = "activeRunStatus";

export const chooseModelId = (
  models: readonly CopilotModel[],
  storedId: string | null,
): string | null => {
  if (storedId && models.some((model) => model.id === storedId)) {
    return storedId;
  }
  return models.find((model) => model.isDefault)?.id ?? models[0]?.id ?? null;
};

export type CreateSessionOutcome =
  | { ok: true; sessionId: string; activated: boolean }
  | { ok: false; error: CopilotError };

export function toCopilotError(
  operation: CopilotError["operation"],
  cause: unknown,
): CopilotError {
  if (
    cause &&
    typeof cause === "object" &&
    "code" in cause &&
    "operation" in cause &&
    "recoverable" in cause
  ) {
    return cause as CopilotError;
  }
  return {
    code: "transport-error",
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
    recoverable: true,
    cause,
  };
}

export function toSessionError(
  operation:
    | "load-sessions"
    | "load-session"
    | "create-session"
    | "update-session",
  cause: unknown,
): CopilotError {
  return { ...toCopilotError(operation, cause), operation };
}

export function ownershipChangedError(
  operation: CopilotError["operation"],
): CopilotError {
  return {
    code: "transport-error",
    operation,
    message: "Copilot runtime ownership changed",
    recoverable: true,
  };
}

export function toRunState(run: CopilotRun): CopilotRunState {
  if (run.status === "queued") return { status: "submitted", run };
  if (run.status === "awaiting-approval" && run.approvalRequest) {
    return {
      status: "awaiting-approval",
      run,
      request: run.approvalRequest,
    };
  }
  if (run.status === "awaiting-answer" && run.questionRequest) {
    return {
      status: "awaiting-answer",
      run,
      request: run.questionRequest,
    };
  }
  return { status: "streaming", run };
}

export function retainLatestResumeSequence(
  resumedRun: CopilotRun,
  previousRun: CopilotRun,
): CopilotRun {
  if (resumedRun.id !== previousRun.id) return resumedRun;
  const lastSequence = Math.max(
    resumedRun.lastSequence ?? -1,
    previousRun.lastSequence ?? -1,
  );
  return lastSequence >= 0 ? { ...resumedRun, lastSequence } : resumedRun;
}

export function summaryFromSession(
  session: CopilotRuntimeState["sessions"][string],
): CopilotSessionSummary {
  const { messages: _messages, ...summary } = session;
  return summary;
}

export function isTerminalRun(run: CopilotRun): boolean {
  return (
    run.status === "completed" ||
    run.status === "failed" ||
    run.status === "cancelled"
  );
}

export function withActiveRunMetadata(
  summary: CopilotSessionSummary,
  run: CopilotRun | null,
): CopilotSessionSummary {
  const metadata = { ...summary.metadata };
  if (run && !isTerminalRun(run)) {
    metadata[ACTIVE_RUN_ID_KEY] = run.id;
    metadata[ACTIVE_RUN_STATUS_KEY] = run.status;
  } else {
    delete metadata[ACTIVE_RUN_ID_KEY];
    delete metadata[ACTIVE_RUN_STATUS_KEY];
  }
  return {
    ...summary,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

export function preserveActiveRunMetadata(
  summary: CopilotSessionSummary,
  previous: CopilotSessionSummary | undefined,
): CopilotSessionSummary {
  if (!previous?.metadata) return summary;
  const metadata = { ...summary.metadata };
  if (ACTIVE_RUN_ID_KEY in previous.metadata) {
    metadata[ACTIVE_RUN_ID_KEY] = previous.metadata[ACTIVE_RUN_ID_KEY];
  }
  if (ACTIVE_RUN_STATUS_KEY in previous.metadata) {
    metadata[ACTIVE_RUN_STATUS_KEY] = previous.metadata[ACTIVE_RUN_STATUS_KEY];
  }
  return {
    ...summary,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

export function clearEmptyPendingReasoningForRun(
  state: CopilotRuntimeState,
  sessionId: string,
  runId: string | undefined,
): CopilotRuntimeState {
  if (!runId) return state;
  const session = state.sessions[sessionId];
  if (!session) return state;
  let changed = false;
  const messages = session.messages.map((message) => {
    if (message.metadata?.runId !== runId) return message;
    let messageChanged = false;
    const parts = message.parts.filter((part) => {
      const isEmptyPendingReasoning =
        part.type === "reasoning" &&
        part.state === "streaming" &&
        part.text.length === 0;
      if (isEmptyPendingReasoning) {
        changed = true;
        messageChanged = true;
      }
      return !isEmptyPendingReasoning;
    });
    return messageChanged ? { ...message, parts } : message;
  });
  if (!changed) return state;
  return {
    ...state,
    sessions: {
      ...state.sessions,
      [sessionId]: { ...session, messages },
    },
  };
}

export function clearEmptyPendingReasoning(
  state: CopilotRuntimeState,
  event: Parameters<typeof reduceCopilotEvent>[1],
): CopilotRuntimeState {
  const shouldClear =
    event.type === "text-delta" ||
    event.type === "part-upsert" ||
    event.type === "awaiting-approval" ||
    event.type === "awaiting-answer" ||
    (event.type === "run-status" && event.status !== "running");
  if (!shouldClear) return state;
  return clearEmptyPendingReasoningForRun(
    state,
    event.sessionId,
    event.runId,
  );
}
