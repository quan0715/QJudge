import { describe, expect, it, vi } from "vitest";
import type { ChatbotRepository } from "@/core/ports/chatbot.repository";
import type {
  ChatMessage,
  ChatRun,
  ChatSession,
  StreamCallbacks,
} from "@/core/types/chatbot.types";
import type {
  CopilotError,
  CopilotRunEvent,
  CopilotSession,
} from "@copilot";
import type { ArtifactRecord } from "@/infrastructure/api/repositories/artifact.repository";
import {
  MemoryCopilotTransport,
  runCopilotTransportContract,
  type CopilotTransportContractSubject,
} from "@copilot/testing";
import {
  mapArtifactRecordToCopilotAttachment,
  mapChatApprovalToCopilot,
  mapChatMessageToCopilot,
  mapChatRunToCopilot,
  mapCopilotRunToChat,
  mapQJudgeError,
} from "./chatbotCopilotMapper";
import { createQJudgeCopilotTransport } from "./qJudgeCopilotTransport";

const legacySession: ChatSession = {
  id: "session-1",
  title: "Session",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T01:00:00Z"),
  messages: [],
};

const legacyRun: ChatRun = {
  id: "run-1",
  sessionId: legacySession.id,
  status: "running",
  kind: "chat",
  modelId: "model-1",
  lastEventSeq: 4,
  assistantMessageId: 42,
};

function createRepository(
  overrides: Partial<ChatbotRepository> = {},
): ChatbotRepository {
  return {
    getSessions: vi.fn().mockResolvedValue([legacySession]),
    getSession: vi.fn().mockResolvedValue(legacySession),
    createSession: vi.fn().mockResolvedValue(legacySession),
    createBackendSession: vi.fn().mockResolvedValue({ id: legacySession.id, status: "ready" }),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    renameSession: vi.fn().mockResolvedValue(legacySession),
    clearSession: vi.fn().mockResolvedValue(legacySession),
    startRun: vi.fn().mockResolvedValue(legacyRun),
    getActiveRuns: vi.fn().mockResolvedValue([legacyRun]),
    subscribeRunEvents: vi.fn().mockResolvedValue(undefined),
    cancelRun: vi.fn().mockResolvedValue({ ...legacyRun, status: "cancelled" }),
    submitRunApproval: vi.fn().mockResolvedValue({ ...legacyRun, status: "running" }),
    submitRunAnswer: vi.fn().mockResolvedValue({ ...legacyRun, status: "running" }),
    getModels: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function toLegacySession(session: CopilotSession): ChatSession {
  return {
    id: session.id,
    title: session.title,
    createdAt: new Date(session.createdAt),
    updatedAt: new Date(session.updatedAt),
    messages: [],
    context: session.metadata,
  };
}

function createQJudgeContractSubject(): CopilotTransportContractSubject {
  const memory = new MemoryCopilotTransport();
  const textByRun = new Map<string, string>();
  const repository: ChatbotRepository = {
    async getSessions() {
      return Promise.all(
        (await memory.listSessions()).map(async (session) =>
          toLegacySession(await memory.getSession(session.id)),
        ),
      );
    },
    async getSession(sessionId) {
      return toLegacySession(await memory.getSession(String(sessionId)));
    },
    async createSession() {
      return toLegacySession(await memory.createSession());
    },
    async createBackendSession() {
      const session = await memory.createSession();
      return { id: session.id, status: "ready" };
    },
    async deleteSession(sessionId) {
      await memory.deleteSession(String(sessionId));
    },
    async renameSession(sessionId, title) {
      await memory.renameSession(String(sessionId), title);
      return toLegacySession(await memory.getSession(String(sessionId)));
    },
    async clearSession(sessionId) {
      return toLegacySession(await memory.getSession(String(sessionId)));
    },
    async startRun(sessionId, content, options) {
      return mapCopilotRunToChat(
        await memory.startRun({
          sessionId: String(sessionId),
          text: content,
          modelId: options?.modelOverride,
        }),
      );
    },
    async getActiveRuns() {
      const runs = [];
      for (const session of await memory.listSessions()) {
        const run = await memory.getActiveRun(session.id);
        if (run) runs.push(mapCopilotRunToChat(run));
      }
      return runs;
    },
    subscribeRunEvents(run, callbacks, options) {
      return new Promise<void>((resolve) => {
        const subscription = memory.subscribeRun(mapChatRunToCopilot(run), {
          next(event) {
            if (event.type === "text-delta") {
              const content = `${textByRun.get(run.id) ?? ""}${event.delta}`;
              textByRun.set(run.id, content);
              callbacks.onMessageUpdate?.({
                content,
                lastEventSeq: event.sequence,
              }, event.resumeSequence);
            } else if (event.type === "awaiting-approval") {
              callbacks.onAwaitingApproval?.({
                actionRequests: event.request.actions.map((action) => ({
                  name: action.name,
                  args: action.arguments,
                })),
                reviewConfigs: [
                  {
                    actionName: event.request.actions[0]?.name ?? "action",
                    allowedDecisions: event.request.allowedDecisions,
                  },
                ],
              }, event.resumeSequence);
            } else if (event.type === "awaiting-answer") {
              callbacks.onAwaitingUserAnswer?.({
                question: event.request.question,
                inputType: event.request.input,
                options: event.request.options,
              }, event.resumeSequence);
            } else if (event.type === "run-status") {
              callbacks.onComplete?.(legacySession, event.resumeSequence);
            }
          },
          error(error) {
            callbacks.onError?.(error.message ?? error.code);
            resolve();
          },
          complete() {
            resolve();
          },
        });
        options?.signal?.addEventListener(
          "abort",
          () => {
            subscription.close();
            resolve();
          },
          { once: true },
        );
      });
    },
    async cancelRun(runId) {
      return mapCopilotRunToChat(await memory.cancelRun(runId));
    },
    async submitRunApproval(runId, decision) {
      return mapCopilotRunToChat(await memory.submitApproval(runId, decision));
    },
    async submitRunAnswer(runId, answer) {
      return mapCopilotRunToChat(await memory.submitAnswer(runId, answer));
    },
    async getModels() {
      return [];
    },
  };
  const upload = async (sessionId: string, file: File): Promise<ArtifactRecord> => ({
    id: `artifact-${file.name}`,
    session_id: sessionId,
    run_id: null,
    step: "user_upload",
    filename: file.name,
    object_key: "private",
    content_type: file.type,
    size_bytes: file.size,
    checksum: "private",
    metadata: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  });
  const transport = createQJudgeCopilotTransport(repository, upload);
  return Object.assign(transport, {
    emit(runId: string, event: CopilotRunEvent) {
      memory.emit(runId, event);
    },
    fail(runId: string, error: CopilotError) {
      memory.fail(runId, error);
    },
  });
}

runCopilotTransportContract(createQJudgeContractSubject);

describe("chatbotCopilotMapper", () => {
  it("preserves the backend assistant message identity on a portable run", () => {
    expect(mapChatRunToCopilot(legacyRun)).toMatchObject({
      id: legacyRun.id,
      assistantMessageId: "42",
    });
  });

  it.each([
    [404, "not-found", false],
    [403, "forbidden", false],
    [503, "transport-error", true],
  ] as const)("maps HTTP %s to %s", (status, code, recoverable) => {
    const cause = Object.assign(new Error(`HTTP ${status}`), { status });

    expect(mapQJudgeError("load-session", cause)).toMatchObject({
      code,
      operation: "load-session",
      recoverable,
    });
  });

  it("rejects all-invalid actions in shared and persisted approval mapping", () => {
    const request = {
      actionRequests: [
        { name: "   ", args: { ignored: true } },
        { name: "\t", args: { alsoIgnored: true } },
      ],
    };

    expect(mapChatApprovalToCopilot(request)).toBeNull();
    expect(
      mapChatRunToCopilot({
        ...legacyRun,
        status: "awaiting_approval",
        approvalPayload: {
          action_requests: request.actionRequests,
        },
      }).approvalRequest,
    ).toBeUndefined();
  });

  it("preserves a persisted approval when mapping an awaiting run", () => {
    expect(
      mapChatRunToCopilot({
        ...legacyRun,
        status: "awaiting_approval",
        approvalPayload: {
          action_requests: [
            { name: "deploy", args: { environment: "staging" } },
          ],
          review_configs: [
            {
              action_name: "deploy",
              allowed_decisions: ["approve", "reject", "unsupported"],
            },
          ],
        },
      }),
    ).toMatchObject({
      status: "awaiting-approval",
      approvalRequest: {
        actions: [
          { name: "deploy", arguments: { environment: "staging" } },
        ],
        allowedDecisions: ["approve", "reject"],
      },
    });
  });

  it.each([
    {
      label: "defaults only when review configuration is absent",
      reviewConfigs: undefined,
      allowedDecisions: ["approve", "reject"],
    },
    {
      label: "keeps explicit unsupported review configuration non-actionable",
      reviewConfigs: [
        { action_name: "deploy", allowed_decisions: ["unsupported"] },
      ],
      allowedDecisions: [],
    },
  ])("$label in persisted approval mapping", ({ reviewConfigs, allowedDecisions }) => {
    expect(
      mapChatRunToCopilot({
        ...legacyRun,
        status: "awaiting_approval",
        approvalPayload: {
          action_requests: [
            { name: "  deploy  ", args: { environment: "staging" } },
            { name: "   ", args: { ignored: true } },
          ],
          review_configs: reviewConfigs,
        },
      }),
    ).toMatchObject({
      approvalRequest: {
        actions: [
          { name: "deploy", arguments: { environment: "staging" } },
        ],
        allowedDecisions,
      },
    });
  });

  it("preserves a persisted question when mapping an awaiting run", () => {
    expect(
      mapChatRunToCopilot({
        ...legacyRun,
        status: "awaiting_user_answer",
        questionPayload: {
          question: "Which rubric should I use?",
          input_type: "text",
          options: [],
        },
      }),
    ).toMatchObject({
      status: "awaiting-answer",
      questionRequest: {
        question: "Which rubric should I use?",
        input: "text",
        options: [],
      },
    });
  });

  it("maps legacy message details to portable message parts", () => {
    const message: ChatMessage = {
      id: "message-1",
      role: "assistant",
      content: "Answer",
      timestamp: new Date("2026-01-01T00:00:00Z"),
      thinkingInfo: { thinking: "Reason", signature: "legacy" },
      toolExecutions: [
        {
          toolName: "search",
          toolCallId: "tool-1",
          inputData: { query: "x" },
          result: { ok: true },
        },
      ],
      todoItems: [{ id: "todo-1", label: "Check", status: "success" }],
      verificationReports: [
        { iteration: 1, passed: true, issues: [], summary: "ok" },
      ],
    };

    expect(mapChatMessageToCopilot(message).parts).toEqual([
      { type: "text", text: "Answer" },
      { type: "reasoning", text: "Reason", state: "complete" },
      {
        type: "tool",
        toolCallId: "tool-1",
        toolName: "search",
        state: "output-ready",
        input: { query: "x" },
        output: { ok: true },
      },
      { type: "data-todo-items", data: message.todoItems },
      { type: "data-verification", data: message.verificationReports },
    ]);
  });

  it("maps a finished tool without output as terminal", () => {
    const message: ChatMessage = {
      id: "message-terminal-tool",
      role: "assistant",
      content: "",
      timestamp: new Date("2026-01-01T00:00:00Z"),
      toolExecutions: [{ toolName: "notify", toolCallId: "tool-no-output" }],
    };

    expect(mapChatMessageToCopilot(message).parts).toEqual([
      {
        type: "tool",
        toolCallId: "tool-no-output",
        toolName: "notify",
        state: "output-ready",
      },
    ]);
  });

  it("keeps QJudge artifact metadata outside the public attachment", () => {
    const artifact: ArtifactRecord = {
      id: "artifact-1",
      session_id: "session-1",
      run_id: "run-1",
      step: "user_upload",
      filename: "answer.pdf",
      object_key: "private/key",
      content_type: "application/pdf",
      size_bytes: 123,
      checksum: "secret-checksum",
      metadata: { source: "user" },
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    expect(mapArtifactRecordToCopilotAttachment(artifact)).toEqual({
      type: "attachment",
      id: "artifact-1",
      name: "answer.pdf",
      mediaType: "application/pdf",
    });
  });
});

describe("createQJudgeCopilotTransport", () => {
  it("enriches each session with its own active run without subscribing", async () => {
    const secondSession: ChatSession = {
      ...legacySession,
      id: "session-2",
      title: "Second",
    };
    const secondRun: ChatRun = {
      ...legacyRun,
      id: "run-2",
      sessionId: secondSession.id,
      status: "awaiting_user_answer",
    };
    const subscribeRunEvents = vi.fn().mockResolvedValue(undefined);
    const repository = createRepository({
      getSessions: vi.fn().mockResolvedValue([legacySession, secondSession]),
      getActiveRuns: vi.fn().mockResolvedValue([legacyRun, secondRun]),
      subscribeRunEvents,
    });

    const sessions = await createQJudgeCopilotTransport(
      repository,
      vi.fn(),
    ).listSessions();

    expect(sessions).toMatchObject([
      {
        id: "session-1",
        metadata: { activeRunId: "run-1", activeRunStatus: "running" },
      },
      {
        id: "session-2",
        metadata: {
          activeRunId: "run-2",
          activeRunStatus: "awaiting-answer",
        },
      },
    ]);
    expect(subscribeRunEvents).not.toHaveBeenCalled();
  });

  it("ignores an all-invalid live approval without transitioning the run", async () => {
    const repository = createRepository({
      subscribeRunEvents: vi.fn(
        async (_run: ChatRun, callbacks: StreamCallbacks) => {
          callbacks.onRunStatus?.("awaiting_approval");
          callbacks.onAwaitingApproval?.({
            actionRequests: [
              { name: "   ", args: { ignored: true } },
              { name: "\t", args: { alsoIgnored: true } },
            ],
          });
          callbacks.onComplete?.(legacySession);
        },
      ),
    });
    const transport = createQJudgeCopilotTransport(repository, vi.fn());
    const run = await transport.startRun({
      sessionId: legacySession.id,
      text: "Hi",
    });
    const events: CopilotRunEvent[] = [];

    transport.subscribeRun(run, {
      next: (event) => events.push(event),
      error: vi.fn(),
      complete: vi.fn(),
    });
    await vi.waitFor(() => expect(events).toHaveLength(1));

    expect(events).toMatchObject([
      { type: "run-status", status: "completed" },
    ]);
  });

  it("does not overwrite prior status with an unvalidated generic approval", async () => {
    const failedRun = { ...legacyRun, status: "failed" as const };
    const repository = createRepository({
      startRun: vi.fn().mockResolvedValue(failedRun),
      subscribeRunEvents: vi.fn(
        async (_run: ChatRun, callbacks: StreamCallbacks) => {
          callbacks.onRunStatus?.("awaiting_approval");
          callbacks.onAwaitingApproval?.({
            actionRequests: [{ name: "   ", args: { ignored: true } }],
          });
          callbacks.onComplete?.(legacySession);
        },
      ),
    });
    const transport = createQJudgeCopilotTransport(repository, vi.fn());
    const run = await transport.startRun({
      sessionId: legacySession.id,
      text: "Hi",
    });
    const events: CopilotRunEvent[] = [];

    transport.subscribeRun(run, {
      next: (event) => events.push(event),
      error: vi.fn(),
      complete: vi.fn(),
    });
    await vi.waitFor(() => expect(events).toHaveLength(1));

    expect(events).toMatchObject([{ type: "run-status", status: "failed" }]);
  });

  it.each([
    {
      label: "defaults only when review configuration is absent",
      reviewConfigs: undefined,
      allowedDecisions: ["approve", "reject"],
    },
    {
      label: "keeps explicit unsupported review configuration non-actionable",
      reviewConfigs: [
        { actionName: "publish", allowedDecisions: ["unsupported"] },
      ],
      allowedDecisions: [],
    },
  ])("$label in live approval events", async ({ reviewConfigs, allowedDecisions }) => {
    const repository = createRepository({
      subscribeRunEvents: vi.fn(
        async (_run: ChatRun, callbacks: StreamCallbacks) => {
          callbacks.onRunStatus?.("awaiting_approval");
          callbacks.onAwaitingApproval?.({
            actionRequests: [
              { name: "  publish  ", args: { id: 1 } },
              { name: "   ", args: { ignored: true } },
            ],
            reviewConfigs,
          });
        },
      ),
    });
    const transport = createQJudgeCopilotTransport(repository, vi.fn());
    const run = await transport.startRun({
      sessionId: legacySession.id,
      text: "Hi",
    });
    const events: CopilotRunEvent[] = [];

    transport.subscribeRun(run, {
      next: (event) => events.push(event),
      error: vi.fn(),
      complete: vi.fn(),
    });
    await vi.waitFor(() => expect(events).toHaveLength(1));

    expect(events[0]).toMatchObject({
      type: "awaiting-approval",
      request: {
        actions: [{ name: "publish", arguments: { id: 1 } }],
        allowedDecisions,
      },
    });
  });

  it("maps cumulative legacy callbacks to monotonic normalized events", async () => {
    const repository = createRepository({
      subscribeRunEvents: vi.fn(
        async (_run: ChatRun, callbacks: StreamCallbacks) => {
          callbacks.onMessageUpdate?.({ content: "Hel", lastEventSeq: 5 }, 5);
          callbacks.onMessageUpdate?.({ content: "Hello", lastEventSeq: 5 }, 5);
          callbacks.onAwaitingApproval?.({
            actionRequests: [{ name: "publish", args: { id: 1 } }],
            reviewConfigs: [
              { actionName: "publish", allowedDecisions: ["approve", "reject"] },
            ],
          }, 5);
        },
      ),
    });
    const transport = createQJudgeCopilotTransport(repository, vi.fn());
    const run = await transport.startRun({
      sessionId: legacySession.id,
      text: "Hi",
    });
    const events: unknown[] = [];

    transport.subscribeRun(run, {
      next: (event) => events.push(event),
      error: vi.fn(),
      complete: vi.fn(),
    });
    await vi.waitFor(() => expect(events).toHaveLength(3));

    expect(events).toMatchObject([
      {
        type: "text-delta",
        delta: "Hel",
        sequence: 1,
        resumeSequence: 5,
        messageId: "42",
      },
      {
        type: "text-delta",
        delta: "lo",
        sequence: 2,
        resumeSequence: 5,
        messageId: "42",
      },
      { type: "awaiting-approval", sequence: 3, resumeSequence: 5 },
    ]);
  });

  it("publishes a tool start and finishes the same Copilot tool part", async () => {
    const repository = createRepository({
      subscribeRunEvents: vi.fn(
        async (_run: ChatRun, callbacks: StreamCallbacks) => {
          callbacks.onToolStarted?.(
            {
              toolName: "search",
              toolCallId: "tool-1",
              inputData: { query: "x" },
            },
            6,
          );
          callbacks.onMessageUpdate?.(
            {
              toolExecutions: [
                {
                  toolName: "search",
                  toolCallId: "tool-1",
                  inputData: { query: "x" },
                },
              ],
            },
            7,
          );
          await new Promise<void>(() => {});
        },
      ),
    });
    const transport = createQJudgeCopilotTransport(repository, vi.fn());
    const run = await transport.startRun({
      sessionId: legacySession.id,
      text: "Hi",
    });
    const events: CopilotRunEvent[] = [];

    transport.subscribeRun(run, {
      next: (event) => events.push(event),
      error: vi.fn(),
      complete: vi.fn(),
    });
    await vi.waitFor(() => expect(events).toHaveLength(2));

    expect(events).toMatchObject([
      {
        type: "part-upsert",
        resumeSequence: 6,
        part: {
          type: "tool",
          toolName: "search",
          state: "input-ready",
        },
      },
      {
        type: "part-upsert",
        resumeSequence: 7,
        part: {
          type: "tool",
          toolName: "search",
          state: "output-ready",
        },
      },
    ]);
    const toolCallIds = events.map((event) =>
      event.type === "part-upsert" && event.part.type === "tool"
        ? event.part.toolCallId
        : null,
    );
    expect(toolCallIds[0]).toEqual(expect.any(String));
    expect(toolCallIds[1]).toBe(toolCallIds[0]);
  });

  it("keeps interleaved tool starts paired to their own terminal updates", async () => {
    const repository = createRepository({
      subscribeRunEvents: vi.fn(
        async (_run: ChatRun, callbacks: StreamCallbacks) => {
          callbacks.onToolStarted?.(
            {
              toolName: "search",
              toolCallId: "tool-a",
              inputData: { query: "a" },
            },
            6,
          );
          callbacks.onToolStarted?.(
            {
              toolName: "fetch",
              toolCallId: "tool-b",
              inputData: { url: "/b" },
            },
            7,
          );
          callbacks.onMessageUpdate?.(
            {
              toolExecutions: [
                {
                  toolName: "search",
                  toolCallId: "tool-a",
                  result: "A",
                },
              ],
            },
            8,
          );
          callbacks.onMessageUpdate?.(
            {
              toolExecutions: [
                {
                  toolName: "fetch",
                  toolCallId: "tool-b",
                  result: "B",
                },
              ],
            },
            9,
          );
          await new Promise<void>(() => {});
        },
      ),
    });
    const transport = createQJudgeCopilotTransport(repository, vi.fn());
    const run = await transport.startRun({
      sessionId: legacySession.id,
      text: "Hi",
    });
    const events: CopilotRunEvent[] = [];

    transport.subscribeRun(run, {
      next: (event) => events.push(event),
      error: vi.fn(),
      complete: vi.fn(),
    });

    await vi.waitFor(() => expect(events).toHaveLength(4));

    expect(events).toMatchObject([
      {
        type: "part-upsert",
        part: {
          type: "tool",
          toolCallId: "tool-a",
          state: "input-ready",
          input: { query: "a" },
        },
      },
      {
        type: "part-upsert",
        part: {
          type: "tool",
          toolCallId: "tool-b",
          state: "input-ready",
          input: { url: "/b" },
        },
      },
      {
        type: "part-upsert",
        part: {
          type: "tool",
          toolCallId: "tool-a",
          state: "output-ready",
          input: { query: "a" },
          output: "A",
        },
      },
      {
        type: "part-upsert",
        part: {
          type: "tool",
          toolCallId: "tool-b",
          state: "output-ready",
          input: { url: "/b" },
          output: "B",
        },
      },
    ]);
  });

  it("normalizes live data parts and resumes from the requested sequence", async () => {
    let callbacks: StreamCallbacks | undefined;
    const subscribeRunEvents = vi.fn(
      async (_run: ChatRun, value: StreamCallbacks) => {
        callbacks = value;
        await new Promise<void>(() => {});
      },
    );
    const repository = createRepository({ subscribeRunEvents });
    const transport = createQJudgeCopilotTransport(repository, vi.fn());
    const run = await transport.startRun({
      sessionId: legacySession.id,
      text: "Hi",
    });
    const events: CopilotRunEvent[] = [];

    transport.subscribeRun(
      run,
      {
        next: (event) => events.push(event),
        error: vi.fn(),
        complete: vi.fn(),
      },
      { fromSequence: 8 },
    );
    await vi.waitFor(() => expect(callbacks).toBeDefined());

    callbacks?.onSessionNotice?.("Summarizing", 9);
    callbacks?.onTodoItemsUpdate?.([
      { id: "todo-1", label: "Check", status: "in_progress" },
    ], 10);
    callbacks?.onNextTurnOptions?.([
      { label: "Continue", message: "continue" },
    ], 11);
    callbacks?.onVerificationReport?.({
      iteration: 1,
      passed: true,
      issues: [],
      summary: "ok",
    }, 12);

    expect(subscribeRunEvents).toHaveBeenCalledWith(
      expect.objectContaining({ lastEventSeq: 8 }),
      expect.any(Object),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(events).toMatchObject([
      {
        type: "run-notice",
        sequence: 1,
        resumeSequence: 9,
        notice: "Summarizing",
      },
      {
        type: "part-upsert",
        sequence: 2,
        resumeSequence: 10,
        part: { type: "data-todo-items" },
      },
      {
        type: "part-upsert",
        sequence: 3,
        resumeSequence: 11,
        part: { type: "data-next-turn-options" },
      },
      {
        type: "part-upsert",
        sequence: 4,
        resumeSequence: 12,
        part: { type: "data-verification" },
      },
    ]);
  });

  it("keeps normalized ordering separate from a shared source cursor", async () => {
    let callbacks: StreamCallbacks | undefined;
    const repository = createRepository({
      subscribeRunEvents: vi.fn(async (_run, value) => {
        callbacks = value;
        await new Promise<void>(() => {});
      }),
    });
    const transport = createQJudgeCopilotTransport(repository, vi.fn());
    const run = await transport.startRun({
      sessionId: legacySession.id,
      text: "Hi",
    });
    const events: CopilotRunEvent[] = [];
    transport.subscribeRun(run, {
      next: (event) => events.push(event),
      error: vi.fn(),
      complete: vi.fn(),
    });
    await vi.waitFor(() => expect(callbacks).toBeDefined());

    callbacks?.onSessionNotice?.(null, 21);
    callbacks?.onAwaitingUserAnswer?.(
      { question: "Continue?", inputType: "text" },
      21,
    );
    callbacks?.onMessageUpdate?.({ content: "Next" }, 22);

    expect(events).toMatchObject([
      { type: "run-notice", sequence: 1, resumeSequence: 21 },
      { type: "awaiting-answer", sequence: 2, resumeSequence: 21 },
      { type: "text-delta", sequence: 3, resumeSequence: 22 },
    ]);
  });

  it("reports a recoverable interruption when the event stream ends without terminal state", async () => {
    const repository = createRepository({
      subscribeRunEvents: vi.fn().mockResolvedValue(undefined),
    });
    const transport = createQJudgeCopilotTransport(repository, vi.fn());
    const run = await transport.startRun({
      sessionId: legacySession.id,
      text: "Hi",
    });
    const error = vi.fn();

    transport.subscribeRun(run, {
      next: vi.fn(),
      error,
      complete: vi.fn(),
    });

    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));
    expect(error.mock.calls[0]?.[0]).toMatchObject({
      operation: "subscribe-run",
      recoverable: true,
    });
  });

  it("maps upload results to public attachments", async () => {
    const artifact = {
      id: "artifact-1",
      filename: "answer.pdf",
      content_type: "application/pdf",
    } as ArtifactRecord;
    const upload = vi.fn().mockResolvedValue(artifact);
    const transport = createQJudgeCopilotTransport(createRepository(), upload);
    const file = new File(["answer"], "answer.pdf", { type: "application/pdf" });

    await expect(transport.uploadAttachment?.("session-1", file)).resolves.toEqual({
      type: "attachment",
      id: "artifact-1",
      name: "answer.pdf",
      mediaType: "application/pdf",
    });
  });

  it("preserves cancelled terminal status from the legacy callback seam", async () => {
    const repository = createRepository({
      subscribeRunEvents: vi.fn(
        async (_run: ChatRun, callbacks: StreamCallbacks) => {
          callbacks.onRunStatus?.("cancelled");
          callbacks.onComplete?.(legacySession);
        },
      ),
    });
    const transport = createQJudgeCopilotTransport(repository, vi.fn());
    const run = await transport.startRun({
      sessionId: legacySession.id,
      text: "Hi",
    });
    const events: CopilotRunEvent[] = [];

    transport.subscribeRun(run, {
      next: (event) => events.push(event),
      error: vi.fn(),
      complete: vi.fn(),
    });
    await vi.waitFor(() => expect(events).toHaveLength(1));

    expect(events[0]).toMatchObject({
      type: "run-status",
      status: "cancelled",
    });
  });

  it("forwards the canonical terminal session to the public observer", async () => {
    const canonicalSession: ChatSession = {
      ...legacySession,
      title: "Canonical title",
      updatedAt: new Date("2026-01-01T02:00:00Z"),
    };
    const repository = createRepository({
      subscribeRunEvents: vi.fn(
        async (_run: ChatRun, callbacks: StreamCallbacks) => {
          callbacks.onRunStatus?.("completed");
          callbacks.onComplete?.(canonicalSession);
        },
      ),
    });
    const transport = createQJudgeCopilotTransport(repository, vi.fn());
    const run = await transport.startRun({
      sessionId: legacySession.id,
      text: "Hi",
    });
    const complete = vi.fn();

    transport.subscribeRun(run, {
      next: vi.fn(),
      error: vi.fn(),
      complete,
    });
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());

    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        id: canonicalSession.id,
        title: "Canonical title",
        updatedAt: canonicalSession.updatedAt,
      }),
    );
  });

  it("preserves the failed run error and canonical terminal session", async () => {
    const canonicalSession: ChatSession = {
      ...legacySession,
      title: "Canonical failed session",
      updatedAt: new Date("2026-01-01T03:00:00Z"),
    };
    const repository = createRepository({
      subscribeRunEvents: vi.fn(
        async (_run: ChatRun, callbacks: StreamCallbacks) => {
          callbacks.onRunStatus?.("failed", 18);
          callbacks.onMessageUpdate?.(
            {
              runStatus: "failed",
              runError: "Tool execution failed",
            },
            18,
          );
          await Promise.resolve();
          callbacks.onComplete?.(canonicalSession, 18);
        },
      ),
    });
    const transport = createQJudgeCopilotTransport(repository, vi.fn());
    const run = await transport.startRun({
      sessionId: legacySession.id,
      text: "Hi",
    });
    const events: CopilotRunEvent[] = [];
    const error = vi.fn();
    const complete = vi.fn();
    const subscription = transport.subscribeRun(run, {
      next: (event) => events.push(event),
      error,
      complete,
    });

    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "run-status",
      status: "failed",
      error: {
        code: "run-failed",
        message: "Tool execution failed",
        recoverable: false,
      },
    });
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        id: canonicalSession.id,
        title: canonicalSession.title,
        updatedAt: canonicalSession.updatedAt,
      }),
    );
    expect(error).not.toHaveBeenCalled();
    expect(subscription.closed).toBe(true);
  });

  it("retains the failed run when canonical session synchronization fails", async () => {
    const repository = createRepository({
      subscribeRunEvents: vi.fn(
        async (_run: ChatRun, callbacks: StreamCallbacks) => {
          callbacks.onRunStatus?.("failed", 19);
          callbacks.onMessageUpdate?.(
            {
              runStatus: "failed",
              runError: "Tool execution failed",
            },
            19,
          );
          callbacks.onError?.("對話同步失敗，請重新整理後再試", 19);
        },
      ),
    });
    const transport = createQJudgeCopilotTransport(repository, vi.fn());
    const run = await transport.startRun({
      sessionId: legacySession.id,
      text: "Hi",
    });
    const events: CopilotRunEvent[] = [];
    const error = vi.fn();
    const complete = vi.fn();
    const subscription = transport.subscribeRun(run, {
      next: (event) => events.push(event),
      error,
      complete,
    });

    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "run-status",
      status: "failed",
      error: {
        code: "run-failed",
        message: "Tool execution failed",
        recoverable: false,
      },
    });
    expect(events[0]).toMatchObject({
      error: {
        cause: expect.objectContaining({
          code: "transport-error",
          message: "對話同步失敗，請重新整理後再試",
        }),
      },
    });
    expect(error).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledWith();
    expect(subscription.closed).toBe(true);
  });
});
