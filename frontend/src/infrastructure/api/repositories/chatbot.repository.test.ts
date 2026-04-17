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
    expect(onTodoItemsUpdate).toHaveBeenCalledWith([
      {
        id: "summarization",
        label: "對話過長，截取摘要中",
        status: "pending",
      },
    ]);
    expect(debugSpy).not.toHaveBeenCalledWith("SSE: unknown event type", {
      type: "summarization_started",
    });

    debugSpy.mockRestore();
  });
});
