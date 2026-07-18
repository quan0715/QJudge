import { describe, expect, it } from "vitest";

import type { CopilotError, CopilotRun, CopilotSession } from ".";
import type { CopilotRuntimeState } from "./copilotReducer";
import { createCopilotRuntimeState } from "./copilotReducer";
import { selectActiveRun, selectActiveSession } from "./copilotSelectors";

const CREATED_AT = new Date("2026-07-13T00:00:00.000Z");

function session(id = "session-1"): CopilotSession {
  return {
    id,
    title: "Session",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    messages: [],
  };
}

function run(sessionId = "session-1"): CopilotRun {
  return {
    id: `run-${sessionId}`,
    sessionId,
    status: "running",
  };
}

describe("selectActiveSession", () => {
  it("returns empty when no session is selected", () => {
    expect(selectActiveSession(createCopilotRuntimeState())).toEqual({
      status: "empty",
      id: null,
      data: null,
      error: null,
    });
  });

  it("returns loading while the selected session is absent", () => {
    expect(
      selectActiveSession({
        ...createCopilotRuntimeState(),
        activeSessionId: "session-1",
      }),
    ).toEqual({
      status: "loading",
      id: "session-1",
      data: null,
      error: null,
    });
  });

  it("returns ready with the selected session", () => {
    const activeSession = session();
    expect(
      selectActiveSession({
        ...createCopilotRuntimeState(),
        activeSessionId: activeSession.id,
        sessions: { [activeSession.id]: activeSession },
      }),
    ).toEqual({
      status: "ready",
      id: activeSession.id,
      data: activeSession,
      error: null,
    });
  });

  it("returns error with any stale session data", () => {
    const activeSession = session();
    const error: CopilotError = {
      code: "transport-error",
      operation: "load-session",
      recoverable: true,
    };
    const state: CopilotRuntimeState = {
      ...createCopilotRuntimeState(),
      activeSessionId: activeSession.id,
      sessions: { [activeSession.id]: activeSession },
    };

    expect(selectActiveSession(state, error)).toEqual({
      status: "error",
      id: activeSession.id,
      data: activeSession,
      error,
    });
  });
});

describe("selectActiveRun", () => {
  it("returns only the selected session run", () => {
    const activeRun = run("session-1");
    const backgroundRun = run("session-2");
    const state: CopilotRuntimeState = {
      ...createCopilotRuntimeState(),
      activeSessionId: "session-1",
      runs: {
        "session-1": { status: "streaming", run: activeRun },
        "session-2": { status: "streaming", run: backgroundRun },
      },
    };

    expect(selectActiveRun(state)).toEqual({
      status: "streaming",
      run: activeRun,
    });
  });

  it("returns ready when the selected session has no run", () => {
    expect(
      selectActiveRun({
        ...createCopilotRuntimeState(),
        activeSessionId: "session-1",
      }),
    ).toEqual({ status: "ready", run: null });
  });
});
