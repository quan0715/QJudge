import type {
  CopilotErrorCode,
  CopilotSession,
  CopilotSessionSummary,
} from "@/core/copilot";

export type CopilotInitialSessionStrategy =
  | "none"
  | "first"
  | "create"
  | "first-or-create";

export interface CopilotSessionBootstrapInput {
  listed: readonly CopilotSessionSummary[];
  locatedId: string | null;
  storedId: string | null;
  strategy: CopilotInitialSessionStrategy;
  load(id: string): Promise<CopilotSession>;
}

export interface CopilotSessionBootstrapResult {
  sessions: CopilotSessionSummary[];
  selectedId: string | null;
  selectedSession: CopilotSession | null;
  create: boolean;
  clearLocation: boolean;
}

function isConfirmedUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = error.code as CopilotErrorCode;
  return code === "not-found" || code === "forbidden";
}

function summaryFromSession(session: CopilotSession): CopilotSessionSummary {
  const { messages: _messages, ...summary } = session;
  return summary;
}

export async function resolveCopilotSessionBootstrap({
  listed,
  locatedId,
  storedId,
  strategy,
  load,
}: CopilotSessionBootstrapInput): Promise<CopilotSessionBootstrapResult> {
  const sessions = [...listed];
  let clearLocation = false;

  if (locatedId) {
    try {
      const selectedSession = await load(locatedId);
      return {
        sessions: [
          summaryFromSession(selectedSession),
          ...sessions.filter((session) => session.id !== locatedId),
        ],
        selectedId: locatedId,
        selectedSession,
        create: false,
        clearLocation: false,
      };
    } catch (error) {
      if (!isConfirmedUnavailable(error)) throw error;
      clearLocation = true;
    }
  }

  const selectedId =
    storedId && sessions.some((session) => session.id === storedId)
      ? storedId
      : strategy === "first" || strategy === "first-or-create"
        ? sessions[0]?.id ?? null
        : null;
  const create =
    selectedId === null &&
    (strategy === "create" || strategy === "first-or-create");

  return {
    sessions,
    selectedId,
    selectedSession: null,
    create,
    clearLocation,
  };
}
