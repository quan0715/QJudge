import { describe, expect, it, vi } from "vitest";

import chatbotRepository from "./chatbot.repository";

describe("chatbotRepository stream events", () => {
  it("propagates the backend sequence through every callback from one source event", () => {
    const callbacks = {
      onSessionNotice: vi.fn(),
      onRunStatus: vi.fn(),
      onAwaitingApproval: vi.fn(),
    };

    (chatbotRepository as unknown as {
      _handleStreamEvent: (
        event: Record<string, unknown>,
        currentMessage: Record<string, unknown>,
        callbacks: typeof callbacks,
        resolvedSessionId: string,
        setResolvedId: (id: string) => void,
      ) => void;
    })._handleStreamEvent(
      {
        type: "awaiting_approval",
        seq: 31,
        action_requests: [{ name: "publish", args: { id: 1 } }],
      },
      {},
      callbacks,
      "session-1",
      vi.fn(),
    );

    expect(callbacks.onSessionNotice).toHaveBeenCalledWith(null, 31);
    expect(callbacks.onRunStatus).toHaveBeenCalledWith("awaiting_approval", 31);
    expect(callbacks.onAwaitingApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        actionRequests: [{ name: "publish", args: { id: 1 } }],
      }),
      31,
    );
  });

  it("propagates source sequences through data, message, and terminal callbacks", () => {
    const callbacks = {
      onTodoItemsUpdate: vi.fn(),
      onMessageUpdate: vi.fn(),
      onVerificationReport: vi.fn(),
      onRunStatus: vi.fn(),
      onSessionNotice: vi.fn(),
      onNextTurnOptions: vi.fn(),
      onComplete: vi.fn(),
    };
    const getSession = vi.spyOn(chatbotRepository, "getSession").mockResolvedValue({
      id: "session-1",
      title: "Session",
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const repository = chatbotRepository as unknown as {
      _handleStreamEvent: (
        event: Record<string, unknown>,
        currentMessage: Record<string, unknown>,
        callbacks: typeof callbacks,
        resolvedSessionId: string,
        setResolvedId: (id: string) => void,
      ) => void;
    };
    const handle = repository._handleStreamEvent.bind(repository);
    const currentMessage = {};

    handle(
      {
        type: "todo_update",
        seq: 32,
        todos: [{ content: "Check", status: "in_progress" }],
      },
      currentMessage,
      callbacks,
      "session-1",
      vi.fn(),
    );
    handle(
      { type: "agent_message_delta", seq: 33, content: "Next" },
      currentMessage,
      callbacks,
      "session-1",
      vi.fn(),
    );
    handle(
      {
        type: "verification_report",
        seq: 34,
        iteration: 1,
        passed: true,
        issues: [],
        summary: "ok",
      },
      currentMessage,
      callbacks,
      "session-1",
      vi.fn(),
    );
    handle(
      {
        type: "run_completed",
        seq: 35,
        next_turn_options: [{ label: "Continue", message: "continue" }],
      },
      currentMessage,
      callbacks,
      "session-1",
      vi.fn(),
    );

    expect(callbacks.onTodoItemsUpdate).toHaveBeenCalledWith(
      [{ id: "0-Check", label: "Check", status: "in_progress" }],
      32,
    );
    expect(callbacks.onMessageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Next" }),
      33,
    );
    expect(callbacks.onVerificationReport).toHaveBeenCalledWith(
      expect.objectContaining({ iteration: 1, passed: true }),
      34,
    );
    expect(callbacks.onMessageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ verificationReports: [expect.any(Object)] }),
      34,
    );
    expect(callbacks.onRunStatus).toHaveBeenCalledWith("completed", 35);
    expect(callbacks.onSessionNotice).toHaveBeenCalledWith(null, 35);
    expect(callbacks.onNextTurnOptions).toHaveBeenCalledWith(
      [{ label: "Continue", message: "continue" }],
      35,
    );
    getSession.mockRestore();
  });

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

  it("clears session notice on summarization_ended", () => {
    const onSessionNotice = vi.fn();

    (chatbotRepository as unknown as {
      _handleStreamEvent: (
        event: { type: string },
        currentMessage: Record<string, unknown>,
        callbacks: { onSessionNotice?: (notice: string | null) => void },
        resolvedSessionId: string,
        setResolvedId: (id: string) => void,
      ) => void;
    })._handleStreamEvent(
      { type: "summarization_ended" },
      {},
      { onSessionNotice },
      "session-1",
      vi.fn(),
    );

    expect(onSessionNotice).toHaveBeenCalledWith(null);
  });

  it("clears session notice on awaiting_approval", () => {
    const onSessionNotice = vi.fn();
    const onAwaitingApproval = vi.fn();

    (chatbotRepository as unknown as {
      _handleStreamEvent: (
        event: { type: string; action_requests?: Array<{ name: string; args: unknown }> },
        currentMessage: Record<string, unknown>,
        callbacks: {
          onSessionNotice?: (notice: string | null) => void;
          onAwaitingApproval?: (req: unknown) => void;
        },
        resolvedSessionId: string,
        setResolvedId: (id: string) => void,
      ) => void;
    })._handleStreamEvent(
      {
        type: "awaiting_approval",
        action_requests: [{ name: "test_tool", args: {} }],
        review_configs: [],
      },
      {},
      { onSessionNotice, onAwaitingApproval },
      "session-1",
      vi.fn(),
    );

    expect(onSessionNotice).toHaveBeenCalledWith(null);
    expect(onAwaitingApproval).toHaveBeenCalled();
  });

  it("keeps thinking dots visible while run_status is running even after message deltas", () => {
    const onMessageUpdate = vi.fn();
    const currentMessage: Record<string, unknown> = { isThinking: true };

    (chatbotRepository as unknown as {
      _handleStreamEvent: (
        event: { type: string; content?: string; run_status?: string },
        currentMessage: Record<string, unknown>,
        callbacks: { onMessageUpdate?: (message: Record<string, unknown>) => void },
        resolvedSessionId: string,
        setResolvedId: (id: string) => void,
      ) => void;
    })._handleStreamEvent(
      {
        type: "agent_message_delta",
        content: "這是一段尚未完成的回覆",
        run_status: "running",
      },
      currentMessage,
      { onMessageUpdate },
      "session-1",
      vi.fn(),
    );

    expect(onMessageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "這是一段尚未完成的回覆",
        runStatus: "running",
        isThinking: true,
      }),
    );
  });

  it("turns off thinking dots when run status is awaiting_approval", () => {
    const currentMessage: Record<string, unknown> = { isThinking: true };

    (chatbotRepository as unknown as {
      _handleStreamEvent: (
        event: { type: string; run_status?: string; action_requests?: unknown[]; review_configs?: unknown[] },
        currentMessage: Record<string, unknown>,
        callbacks: Record<string, never>,
        resolvedSessionId: string,
        setResolvedId: (id: string) => void,
      ) => void;
    })._handleStreamEvent(
      {
        type: "awaiting_approval",
        run_status: "awaiting_approval",
        action_requests: [],
        review_configs: [],
      },
      currentMessage,
      {},
      "session-1",
      vi.fn(),
    );

    expect(currentMessage.isThinking).toBe(false);
    expect(currentMessage.runStatus).toBe("awaiting_approval");
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

  it("deduplicates todo labels without filtering by localized text", () => {
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
          { status: "completed", content: "讀取現有題庫結構" },
          { status: "pending", content: "規劃新題目主題與難度" },
          { status: "in_progress", content: "使用 qjudge_exam(action='create') 再新增一題單選題" },
          { status: "in_progress", content: "規劃新題目主題與難度" },
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
      { id: "0-讀取現有題庫結構", label: "讀取現有題庫結構", status: "success" },
      { id: "1-規劃新題目主題與難度", label: "規劃新題目主題與難度", status: "in_progress" },
      {
        id: "2-使用 qjudge_exam(action='create') 再新增一題單選題",
        label: "使用 qjudge_exam(action='create') 再新增一題單選題",
        status: "in_progress",
      },
    ]);
  });

  it("updates todos immediately from write_todos tool_call_started input", () => {
    const onTodoItemsUpdate = vi.fn();
    const onMessageUpdate = vi.fn();
    const currentMessage: Record<string, unknown> = {};

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
      currentMessage,
      {
        onTodoItemsUpdate,
        onMessageUpdate,
      },
      "session-1",
      vi.fn(),
    );

    expect(onTodoItemsUpdate).toHaveBeenCalledWith([
      { id: "0-分析需求規格", label: "分析需求規格", status: "success" },
      { id: "1-設計系統架構", label: "設計系統架構", status: "in_progress" },
      { id: "2-實作核心功能", label: "實作核心功能", status: "pending" },
    ]);
    expect(currentMessage.toolName).toBeUndefined();
    expect(onMessageUpdate).not.toHaveBeenCalled();
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
    const onMessageUpdate = vi.fn();
    const currentMessage: Record<string, unknown> = {};
    const handleStreamEvent = (chatbotRepository as unknown as {
      _handleStreamEvent: (
        event: {
          type: string;
          tool_name?: string;
          input_data?: { todos: Array<{ status: string; content: string }> };
          result?: string;
          is_error?: boolean;
        },
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
        type: "tool_call_started",
        tool_name: "write_todos",
        input_data: {
          todos: [
            { status: "pending", content: "分析需求規格" },
          ],
        },
      },
      currentMessage,
      {
        onTodoItemsUpdate,
        onMessageUpdate,
      },
      "session-1",
      vi.fn(),
    );

    handleStreamEvent(
      {
        type: "tool_call_finished",
        result:
          "Command(update={'todos': [{'content': '分析需求規格', 'status': 'completed'}, {'content': '設計系統架構', 'status': 'in_progress'}, {'content': '實作核心功能', 'status': 'pending'}], 'messages': [ToolMessage(content=\"Updated todo list\", tool_call_id='call_00')]})",
        is_error: false,
      },
      currentMessage,
      {
        onTodoItemsUpdate,
        onMessageUpdate,
      },
      "session-1",
      vi.fn(),
    );

    expect(onTodoItemsUpdate).toHaveBeenCalledWith([
      { id: "0-分析需求規格", label: "分析需求規格", status: "success" },
      { id: "1-設計系統架構", label: "設計系統架構", status: "in_progress" },
      { id: "2-實作核心功能", label: "實作核心功能", status: "pending" },
    ]);
    expect(currentMessage.toolName).toBeUndefined();
    expect(currentMessage.toolExecutions).toBeUndefined();
    expect(onMessageUpdate).not.toHaveBeenCalled();
  });

  it("formats read_file tool calls reading SKILL.md as use skill", () => {
    const onMessageUpdate = vi.fn();
    const currentMessage: Record<string, unknown> = {};
    const handleStreamEvent = (chatbotRepository as unknown as {
      _handleStreamEvent: (
        event: any,
        currentMessage: Record<string, unknown>,
        callbacks: { onMessageUpdate?: (message: Record<string, unknown>) => void },
        resolvedSessionId: string,
        setResolvedId: (id: string) => void,
      ) => void;
    })._handleStreamEvent;

    handleStreamEvent(
      {
        type: "tool_call_started",
        tool_name: "read_file",
        tool_call_id: "call_skill",
        input_data: { file_path: "/app/.deepagents/skills/qjudge-mcp-tool-operator/SKILL.md" },
      },
      currentMessage,
      { onMessageUpdate },
      "session-1",
      vi.fn(),
    );

    expect(currentMessage.toolName).toBe("__skill__:qjudge-mcp-tool-operator");

    handleStreamEvent(
      {
        type: "tool_call_finished",
        tool_name: "read_file",
        tool_call_id: "call_skill",
        result: "skill content",
      },
      currentMessage,
      { onMessageUpdate },
      "session-1",
      vi.fn(),
    );

    expect(currentMessage.toolExecutions).toEqual([
      expect.objectContaining({
        toolName: "__skill__:qjudge-mcp-tool-operator",
        toolCallId: "call_skill",
        inputData: { file_path: "/app/.deepagents/skills/qjudge-mcp-tool-operator/SKILL.md" },
      }),
    ]);
  });

  it("maps timeout run_failed to actionable message and updates assistant status", () => {
    const onMessageUpdate = vi.fn();
    const onError = vi.fn();
    const getSessionSpy = vi
      .spyOn(chatbotRepository, "getSession")
      .mockResolvedValue({
        id: "session-1",
        title: "Test",
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
    const currentMessage: Record<string, unknown> = {
      runId: "run-1",
      runStatus: "running",
      isThinking: true,
    };

    (chatbotRepository as unknown as {
      _handleStreamEvent: (
        event: { type: string; error_code?: string; message?: string },
        currentMessage: Record<string, unknown>,
        callbacks: {
          onMessageUpdate?: (message: Record<string, unknown>) => void;
          onError?: (error: string) => void;
        },
        resolvedSessionId: string,
        setResolvedId: (id: string) => void,
      ) => void;
    })._handleStreamEvent(
      {
        type: "run_failed",
        error_code: "RUN_TIMEOUT",
        message: "execution timed out",
      },
      currentMessage,
      { onMessageUpdate, onError },
      "session-1",
      vi.fn(),
    );

    expect(onMessageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        runStatus: "failed",
        isThinking: false,
        runError: "任務執行太長，請手動繼續任務",
      }),
    );
    expect(onError).toHaveBeenCalledWith("任務執行太長，請手動繼續任務");
    getSessionSpy.mockRestore();
  });

  it("keeps original run_failed message for non-timeout failures", () => {
    const onError = vi.fn();
    const getSessionSpy = vi
      .spyOn(chatbotRepository, "getSession")
      .mockResolvedValue({
        id: "session-1",
        title: "Test",
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

    (chatbotRepository as unknown as {
      _handleStreamEvent: (
        event: { type: string; error_code?: string; message?: string },
        currentMessage: Record<string, unknown>,
        callbacks: { onError?: (error: string) => void },
        resolvedSessionId: string,
        setResolvedId: (id: string) => void,
      ) => void;
    })._handleStreamEvent(
      {
        type: "run_failed",
        error_code: "RUN_FAILED",
        message: "Tool execution failed",
      },
      {},
      { onError },
      "session-1",
      vi.fn(),
    );

    expect(onError).toHaveBeenCalledWith("Tool execution failed");
    getSessionSpy.mockRestore();
  });
});
