import type {
  CopilotRun,
  CopilotRunStatus,
  CopilotSessionSummary,
} from "@copilot";

const copilotRunStatuses: ReadonlySet<CopilotRunStatus> = new Set([
  "queued",
  "running",
  "awaiting-approval",
  "awaiting-answer",
  "completed",
  "failed",
  "cancelled",
]);

export interface GradingSessionRun {
  id: string;
  status: CopilotRunStatus;
  modelId?: string;
}

export function selectGradingSessionRun(
  sessions: readonly CopilotSessionSummary[],
  sessionId: string,
): GradingSessionRun | null {
  const metadata = sessions.find((session) => session.id === sessionId)?.metadata;
  const id = metadata?.activeRunId;
  const status = metadata?.activeRunStatus;
  if (
    typeof id !== "string" ||
    typeof status !== "string" ||
    !copilotRunStatuses.has(status as CopilotRunStatus)
  ) {
    return null;
  }
  return { id, status: status as CopilotRunStatus };
}

export function selectEffectiveGradingRun(params: {
  sessions: readonly CopilotSessionSummary[];
  sessionId: string;
  activeSessionId: string | null;
  activeRun: CopilotRun | null;
}): GradingSessionRun | null {
  if (params.sessionId === params.activeSessionId) {
    if (params.activeRun?.sessionId !== params.sessionId) return null;
    return {
      id: params.activeRun.id,
      status: params.activeRun.status,
      modelId: params.activeRun.modelId,
    };
  }
  return selectGradingSessionRun(params.sessions, params.sessionId);
}
