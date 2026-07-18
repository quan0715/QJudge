import { describe, expect, it } from "vitest";

import type {
  CopilotError,
  CopilotMessage,
  CopilotRun,
  CopilotRunEvent,
  CopilotRunState,
  CopilotSession,
} from ".";
import {
  createCopilotRuntimeState,
  reduceCopilotEvent,
  type CopilotRuntimeState,
} from "./copilotReducer";

const CREATED_AT = new Date("2026-07-13T00:00:00.000Z");

function makeMessage(): CopilotMessage {
  return {
    id: "message-1",
    role: "assistant",
    createdAt: CREATED_AT,
    parts: [
      { type: "text", text: "" },
      { type: "reasoning", text: "", state: "streaming" },
    ],
  };
}

function makeSession(messages: CopilotMessage[] = [makeMessage()]): CopilotSession {
  return {
    id: "session-1",
    title: "Session",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    messages,
  };
}

function makeRun(overrides: Partial<CopilotRun> = {}): CopilotRun {
  return {
    id: "run-1",
    sessionId: "session-1",
    status: "running",
    lastSequence: 0,
    ...overrides,
  };
}

function makeState(runState?: CopilotRunState): CopilotRuntimeState {
  const state = createCopilotRuntimeState();
  const session = makeSession();
  const run = makeRun();
  return {
    ...state,
    sessions: { [session.id]: session },
    activeSessionId: session.id,
    runs: {
      [session.id]: runState ?? { status: "streaming", run },
    },
  };
}

function textEvent(overrides: Partial<CopilotRunEvent> = {}): CopilotRunEvent {
  return {
    type: "text-delta",
    runId: "run-1",
    sessionId: "session-1",
    sequence: 1,
    messageId: "message-1",
    delta: "Hello",
    ...overrides,
  } as CopilotRunEvent;
}

describe("reduceCopilotEvent", () => {
  it("appends a text delta immutably to the matching message part", () => {
    const state = makeState();

    const next = reduceCopilotEvent(state, textEvent());

    expect(next).not.toBe(state);
    expect(state.sessions["session-1"].messages[0].parts[0]).toEqual({
      type: "text",
      text: "",
    });
    expect(next.sessions["session-1"].messages[0].parts[0]).toEqual({
      type: "text",
      text: "Hello",
    });
    expect(next.lastSequenceByRun["run-1"]).toBe(1);
  });

  it("appends reasoning without changing the text part", () => {
    const state = makeState();

    const next = reduceCopilotEvent(state, {
      type: "reasoning-delta",
      runId: "run-1",
      sessionId: "session-1",
      sequence: 1,
      messageId: "message-1",
      delta: "Thinking",
    });

    expect(next.sessions["session-1"].messages[0].parts).toEqual([
      { type: "text", text: "" },
      { type: "reasoning", text: "Thinking", state: "streaming" },
    ]);
  });

  it("upserts a tool part by toolCallId without changing part order", () => {
    const message = makeMessage();
    message.parts = [
      {
        type: "tool",
        toolCallId: "tool-1",
        toolName: "search",
        state: "input-ready",
        input: { query: "one" },
      },
      { type: "text", text: "Result" },
    ];
    const state = makeState({ status: "streaming", run: makeRun() });
    state.sessions = { "session-1": makeSession([message]) };

    const next = reduceCopilotEvent(state, {
      type: "part-upsert",
      runId: "run-1",
      sessionId: "session-1",
      sequence: 1,
      messageId: "message-1",
      part: {
        type: "tool",
        toolCallId: "tool-1",
        toolName: "search",
        state: "output-ready",
        output: "done",
      },
    });

    expect(next.sessions["session-1"].messages[0].parts).toEqual([
      {
        type: "tool",
        toolCallId: "tool-1",
        toolName: "search",
        state: "output-ready",
        output: "done",
      },
      { type: "text", text: "Result" },
    ]);
  });

  it("returns the same state for a replayed sequence", () => {
    const once = reduceCopilotEvent(makeState(), textEvent());

    expect(reduceCopilotEvent(once, textEvent())).toBe(once);
  });

  it("returns the same state for an unknown session", () => {
    const state = makeState();

    expect(
      reduceCopilotEvent(
        state,
        textEvent({ sessionId: "session-stale" } as Partial<CopilotRunEvent>),
      ),
    ).toBe(state);
  });

  it("returns the same state for a stale run", () => {
    const state = makeState();

    expect(
      reduceCopilotEvent(
        state,
        textEvent({ runId: "run-stale" } as Partial<CopilotRunEvent>),
      ),
    ).toBe(state);
  });

  it("enters awaiting approval with the normalized request", () => {
    const state = makeState();
    const request = {
      actions: [{ name: "write", arguments: { path: "answer.md" } }],
      allowedDecisions: ["approve", "reject"] as Array<"approve" | "reject">,
    };

    const next = reduceCopilotEvent(state, {
      type: "awaiting-approval",
      runId: "run-1",
      sessionId: "session-1",
      sequence: 1,
      request,
    });

    expect(next.runs["session-1"]).toEqual({
      status: "awaiting-approval",
      run: { ...makeRun(), status: "awaiting-approval", lastSequence: 1 },
      request,
    });
  });

  it("supports a second approval cycle after the run resumes", () => {
    const first = reduceCopilotEvent(makeState(), {
      type: "awaiting-approval",
      runId: "run-1",
      sessionId: "session-1",
      sequence: 1,
      request: {
        actions: [{ name: "first" }],
        allowedDecisions: ["approve"],
      },
    });
    const resumed = reduceCopilotEvent(first, {
      type: "run-status",
      runId: "run-1",
      sessionId: "session-1",
      sequence: 2,
      status: "running",
    });

    const second = reduceCopilotEvent(resumed, {
      type: "awaiting-approval",
      runId: "run-1",
      sessionId: "session-1",
      sequence: 3,
      request: {
        actions: [{ name: "second" }],
        allowedDecisions: ["reject"],
      },
    });

    expect(second.runs["session-1"]).toMatchObject({
      status: "awaiting-approval",
      request: { actions: [{ name: "second" }] },
    });
  });

  it("enters awaiting answer with the normalized question", () => {
    const request = {
      question: "Continue?",
      input: "choice" as const,
      options: ["yes", "no"],
    };

    const next = reduceCopilotEvent(makeState(), {
      type: "awaiting-answer",
      runId: "run-1",
      sessionId: "session-1",
      sequence: 1,
      request,
    });

    expect(next.runs["session-1"]).toEqual({
      status: "awaiting-answer",
      run: { ...makeRun(), status: "awaiting-answer", lastSequence: 1 },
      request,
    });
  });

  it("returns to ready when the run completes", () => {
    const next = reduceCopilotEvent(makeState(), {
      type: "run-status",
      runId: "run-1",
      sessionId: "session-1",
      sequence: 1,
      status: "completed",
    });

    expect(next.runs["session-1"]).toEqual({ status: "ready", run: null });
  });

  it("exposes a failed run through the error state", () => {
    const error: CopilotError = {
      code: "run-failed",
      operation: "subscribe-run",
      recoverable: true,
    };

    const next = reduceCopilotEvent(makeState(), {
      type: "run-status",
      runId: "run-1",
      sessionId: "session-1",
      sequence: 1,
      status: "failed",
      error,
    });

    expect(next.runs["session-1"]).toEqual({
      status: "error",
      run: { ...makeRun(), status: "failed", lastSequence: 1 },
      error,
    });
  });

  it("returns to ready when the run is cancelled", () => {
    const next = reduceCopilotEvent(makeState(), {
      type: "run-status",
      runId: "run-1",
      sessionId: "session-1",
      sequence: 1,
      status: "cancelled",
    });

    expect(next.runs["session-1"]).toEqual({ status: "ready", run: null });
  });
});
