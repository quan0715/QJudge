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

  it("updates todos immediately from write_todos tool_call_started input", () => {
    const onTodoItemsUpdate = vi.fn();

    (chatbotRepository as unknown as {
      _handleStreamEvent: (
        event: {
          type: string;
          tool_name: string;
          input_data: { todos: Array<{ status: string; content: string }> };
        },
        currentMessage: Record<string, unknown>,
        callbacks: {
          onTodoItemsUpdate?: (items: unknown[] | null) => void;
          onMessageUpdate?: (message: Record<string, unknown>) => void;
        },
        resolvedSessionId: string,
        setResolvedId: (id: string) => void,
      ) => void;
    })._handleStreamEvent(
      {
        type: "tool_call_started",
        tool_name: "write_todos",
        input_data: {
          todos: [
            { status: "completed", content: "分析需求規格" },
            { status: "in_progress", content: "設計系統架構" },
            { status: "pending", content: "實作核心功能" },
          ],
        },
      },
      {},
      {
        onTodoItemsUpdate,
        onMessageUpdate: vi.fn(),
      },
      "session-1",
      vi.fn(),
    );

    expect(onTodoItemsUpdate).toHaveBeenCalledWith([
      { id: "0-分析需求規格", label: "分析需求規格", status: "success" },
      { id: "1-設計系統架構", label: "設計系統架構", status: "in_progress" },
      { id: "2-實作核心功能", label: "實作核心功能", status: "pending" },
    ]);
  });

  it("extracts todo command text from streamed assistant deltas", () => {
    const onTodoItemsUpdate = vi.fn();
    const onMessageUpdate = vi.fn();
    const currentMessage = {};
    const handleStreamEvent = (chatbotRepository as unknown as {
      _handleStreamEvent: (
        event: { type: string; content: string },
        currentMessage: Record<string, unknown>,
        callbacks: {
          onTodoItemsUpdate?: (items: unknown[] | null) => void;
          onMessageUpdate?: (message: Record<string, unknown>) => void;
        },
        resolvedSessionId: string,
        setResolvedId: (id: string) => void,
      ) => void;
    })._handleStreamEvent;

    handleStreamEvent(
      {
        type: "agent_message_delta",
        content: "command(update_{todos: [{ content: 測試任務 1, status: pending}, ",
      },
      currentMessage,
      { onTodoItemsUpdate, onMessageUpdate },
      "session-1",
      vi.fn(),
    );
    handleStreamEvent(
      {
        type: "agent_message_delta",
        content: "{ content: 測試任務 2, status: completed}]})",
      },
      currentMessage,
      { onTodoItemsUpdate, onMessageUpdate },
      "session-1",
      vi.fn(),
    );

    expect(onTodoItemsUpdate).toHaveBeenCalledWith([
      { id: "0-測試任務 1", label: "測試任務 1", status: "pending" },
      { id: "1-測試任務 2", label: "測試任務 2", status: "success" },
    ]);
    expect(onMessageUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: "" }),
    );
  });

  it("extracts LangGraph Command(update=...) todos as soon as the todo list closes", () => {
    const onTodoItemsUpdate = vi.fn();
    const onMessageUpdate = vi.fn();
    const currentMessage = {};
    const handleStreamEvent = (chatbotRepository as unknown as {
      _handleStreamEvent: (
        event: { type: string; content: string },
        currentMessage: Record<string, unknown>,
        callbacks: {
          onTodoItemsUpdate?: (items: unknown[] | null) => void;
          onMessageUpdate?: (message: Record<string, unknown>) => void;
        },
        resolvedSessionId: string,
        setResolvedId: (id: string) => void,
      ) => void;
    })._handleStreamEvent;

    handleStreamEvent(
      {
        type: "agent_message_delta",
        content:
          "Command(update={'todos': [{'content': '1. 讀取題目資料', 'status': 'pending'}, {'content': '2. 分析題目要求', 'status': 'completed'}], ",
      },
      currentMessage,
      { onTodoItemsUpdate, onMessageUpdate },
      "session-1",
      vi.fn(),
    );

    expect(onTodoItemsUpdate).toHaveBeenCalledWith([
      { id: "0-1. 讀取題目資料", label: "1. 讀取題目資料", status: "pending" },
      { id: "1-2. 分析題目要求", label: "2. 分析題目要求", status: "success" },
    ]);
    expect(onMessageUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: "" }),
    );
  });

  it("updates todos from tool_call_finished Command result", () => {
    const onTodoItemsUpdate = vi.fn();

    (chatbotRepository as unknown as {
      _handleStreamEvent: (
        event: { type: string; result: string; is_error: boolean },
        currentMessage: Record<string, unknown>,
        callbacks: {
          onTodoItemsUpdate?: (items: unknown[] | null) => void;
          onMessageUpdate?: (message: Record<string, unknown>) => void;
        },
        resolvedSessionId: string,
        setResolvedId: (id: string) => void,
      ) => void;
    })._handleStreamEvent(
      {
        type: "tool_call_finished",
        result:
          "Command(update={'todos': [{'content': '分析需求規格', 'status': 'completed'}, {'content': '設計系統架構', 'status': 'in_progress'}, {'content': '實作核心功能', 'status': 'pending'}], 'messages': [ToolMessage(content=\"Updated todo list\", tool_call_id='call_00')]})",
        is_error: false,
      },
      {},
      {
        onTodoItemsUpdate,
        onMessageUpdate: vi.fn(),
      },
      "session-1",
      vi.fn(),
    );

    expect(onTodoItemsUpdate).toHaveBeenCalledWith([
      { id: "0-分析需求規格", label: "分析需求規格", status: "success" },
      { id: "1-設計系統架構", label: "設計系統架構", status: "in_progress" },
      { id: "2-實作核心功能", label: "實作核心功能", status: "pending" },
    ]);
  });
});
