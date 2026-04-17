import { describe, expect, it } from "vitest";

import type { ChatRun, ChatSession } from "@/core/types/chatbot.types";
import { applyRunMessageUpdate, type StreamedRunState } from "./useChatbot";

const baseSession = (): ChatSession => ({
  id: "session-1",
  title: "Session",
  messages: [],
  createdAt: new Date("2026-04-17T00:00:00.000Z"),
  updatedAt: new Date("2026-04-17T00:00:00.000Z"),
});

const baseRun = (): ChatRun => ({
  id: "run-1",
  sessionId: "session-1",
  status: "running",
  kind: "chat",
  modelId: "deepseek-r1",
  lastEventSeq: 0,
  assistantMessageId: 42,
});

describe("applyRunMessageUpdate", () => {
  it("creates an assistant draft when stream events arrive before session reload", () => {
    const streamedState: StreamedRunState = { content: "", thinking: "" };

    const nextSession = applyRunMessageUpdate(
      baseSession(),
      baseRun(),
      {
        content: "Hello",
        runStatus: "running",
        lastEventSeq: 3,
      },
      streamedState,
    );

    expect(nextSession.messages).toHaveLength(1);
    expect(nextSession.messages[0]).toMatchObject({
      id: "42",
      role: "assistant",
      content: "Hello",
      runId: "run-1",
      runStatus: "running",
      lastEventSeq: 3,
    });
  });

  it("merges cumulative subscription updates without duplicating rendered text", () => {
    const streamedState: StreamedRunState = { content: "", thinking: "" };
    const run = baseRun();
    const initialSession: ChatSession = {
      ...baseSession(),
      messages: [
        {
          id: "42",
          role: "assistant",
          content: "",
          timestamp: new Date("2026-04-17T00:00:00.000Z"),
          runId: "run-1",
          runStatus: "running",
        },
      ],
    };

    const first = applyRunMessageUpdate(
      initialSession,
      run,
      { content: "Hel", thinkingInfo: { thinking: "thi", signature: "" } },
      streamedState,
    );
    const second = applyRunMessageUpdate(
      first,
      run,
      { content: "Hello", thinkingInfo: { thinking: "think", signature: "" } },
      streamedState,
    );

    expect(second.messages[0].content).toBe("Hello");
    expect(second.messages[0].thinkingInfo?.thinking).toBe("think");
  });

  it("should not update user messages even if runId matches", () => {
    const streamedState: StreamedRunState = { content: "", thinking: "" };
    const run = baseRun();
    const userMessage = {
      id: "user-1",
      role: "user" as const,
      content: "Hi AI",
      timestamp: new Date("2026-04-17T00:00:00.000Z"),
      runId: "run-1",
    };
    const initialSession: ChatSession = {
      ...baseSession(),
      messages: [userMessage],
    };

    const nextSession = applyRunMessageUpdate(
      initialSession,
      run,
      { content: "Hello", runStatus: "running" as const },
      streamedState,
    );

    // Should create a new assistant message and NOT update the user message
    expect(nextSession.messages).toHaveLength(2);
    expect(nextSession.messages[0].content).toBe("Hi AI");
    expect(nextSession.messages[1]).toMatchObject({
      id: "42",
      role: "assistant",
      content: "Hello",
      runId: "run-1",
    });
  });
  it("replaces todo items in the assistant draft", () => {
    const streamedState: StreamedRunState = { content: "", thinking: "" };
    const run = baseRun();
    const initialSession: ChatSession = {
      ...baseSession(),
      messages: [
        {
          id: "42",
          role: "assistant",
          content: "",
          timestamp: new Date("2026-04-17T00:00:00.000Z"),
          runId: "run-1",
          runStatus: "running",
          todoItems: [
            { id: "old-1", label: "舊任務", status: "pending" },
          ],
        },
      ],
    };
    const nextSession = applyRunMessageUpdate(
      initialSession,
      run,
      {
        todoItems: [
          { id: "new-1", label: "新任務", status: "in_progress" },
        ],
      },
      streamedState,
    );

    expect(nextSession.messages).toHaveLength(1);
    expect(nextSession.messages[0].todoItems).toEqual([
      { id: "new-1", label: "新任務", status: "in_progress" },
    ]);
  });
});
