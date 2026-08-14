import { describe, expect, it } from "vitest";
import type { CopilotRunStatus, CopilotSessionSummary } from "@copilot";
import {
  selectEffectiveGradingRun,
  selectGradingSessionRun,
} from "./copilotGradingSelectors";

const session: CopilotSessionSummary = {
  id: "session-1",
  title: "Grading",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  metadata: {
    activeRunId: "run-1",
    activeRunStatus: "awaiting-answer",
  },
};

describe("selectGradingSessionRun", () => {
  it("reads background run metadata without a subscription", () => {
    expect(selectGradingSessionRun([session], session.id)).toEqual({
      id: "run-1",
      status: "awaiting-answer",
    });
  });

  it.each<CopilotRunStatus>([
    "queued",
    "running",
    "awaiting-approval",
    "awaiting-answer",
    "completed",
    "failed",
    "cancelled",
  ])("accepts the public %s run status", (status) => {
    expect(
      selectGradingSessionRun(
        [{ ...session, metadata: { activeRunId: "run-2", activeRunStatus: status } }],
        session.id,
      ),
    ).toEqual({ id: "run-2", status });
  });

  it("returns null for malformed metadata", () => {
    expect(selectGradingSessionRun([{ ...session, metadata: {} }], session.id)).toBeNull();
    expect(
      selectGradingSessionRun(
        [{ ...session, metadata: { activeRunId: 7, activeRunStatus: "running" } }],
        session.id,
      ),
    ).toBeNull();
    expect(
      selectGradingSessionRun(
        [{ ...session, metadata: { activeRunId: "run-1", activeRunStatus: "paused" } }],
        session.id,
      ),
    ).toBeNull();
  });

  it("does not borrow metadata from a different session", () => {
    expect(selectGradingSessionRun([session], "session-2")).toBeNull();
  });
});

describe("selectEffectiveGradingRun", () => {
  it("uses the subscribed public run for the active session", () => {
    expect(
      selectEffectiveGradingRun({
        sessions: [session],
        sessionId: session.id,
        activeSessionId: session.id,
        activeRun: {
          id: "run-live",
          sessionId: session.id,
          status: "completed",
          modelId: "model-live",
        },
      }),
    ).toEqual({ id: "run-live", status: "completed", modelId: "model-live" });
  });

  it("does not use stale background metadata for the active session", () => {
    expect(
      selectEffectiveGradingRun({
        sessions: [session],
        sessionId: session.id,
        activeSessionId: session.id,
        activeRun: null,
      }),
    ).toBeNull();
  });

  it("uses validated metadata when the grading session is in the background", () => {
    expect(
      selectEffectiveGradingRun({
        sessions: [session],
        sessionId: session.id,
        activeSessionId: "session-2",
        activeRun: {
          id: "run-other",
          sessionId: "session-2",
          status: "running",
        },
      }),
    ).toEqual({ id: "run-1", status: "awaiting-answer" });
  });
});
