import { describe, expect, it, vi } from "vitest";

import chatbotRepository from "./chatbot.repository";

describe("chatbotRepository stream events", () => {
  it("handles summarization_started without falling through to unknown event logging", () => {
    const onSessionNotice = vi.fn();
    const onTodoItemsUpdate = vi.fn();
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    (chatbotRepository as unknown as {
      _handleStreamEvent: (
        event: { type: string },
        currentMessage: Record<string, unknown>,
        callbacks: {
          onSessionNotice?: (notice: string | null) => void;
          onTodoItemsUpdate?: (items: unknown[] | null) => void;
        },
        resolvedSessionId: string,
        setResolvedId: (id: string) => void,
      ) => void;
    })._handleStreamEvent(
      { type: "summarization_started" },
      {},
      {
        onSessionNotice,
        onTodoItemsUpdate,
      },
      "session-1",
      vi.fn(),
    );

    expect(onSessionNotice).toHaveBeenCalledWith("對話過長，截取摘要中");
    expect(onTodoItemsUpdate).not.toHaveBeenCalled();
    expect(debugSpy).not.toHaveBeenCalledWith("SSE: unknown event type", {
      type: "summarization_started",
    });

    debugSpy.mockRestore();
  });

  it("normalizes todo_update payloads into run todo items", () => {
    const onTodoItemsUpdate = vi.fn();

    (chatbotRepository as unknown as {
      _handleStreamEvent: (
        event: { type: string; todos: Array<{ status: string; content: string }> },
        currentMessage: Record<string, unknown>,
        callbacks: {
          onTodoItemsUpdate?: (items: unknown[] | null) => void;
        },
        resolvedSessionId: string,
        setResolvedId: (id: string) => void,
      ) => void;
    })._handleStreamEvent(
      {
        type: "todo_update",
        todos: [
          { status: "completed", content: "任務 A" },
          { status: "pending", content: "任務 B" },
          { status: "failed", content: "任務 C" },
        ],
      },
      {},
      {
        onTodoItemsUpdate,
      },
      "session-1",
      vi.fn(),
    );

    expect(onTodoItemsUpdate).toHaveBeenCalledWith([
      { id: "0-任務 A", label: "任務 A", status: "success" },
      { id: "1-任務 B", label: "任務 B", status: "pending" },
      { id: "2-任務 C", label: "任務 C", status: "fail" },
    ]);
  });
});
