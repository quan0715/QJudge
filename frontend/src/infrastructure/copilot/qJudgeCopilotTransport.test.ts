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
} from "@/core/copilot";
import type { ArtifactRecord } from "@/infrastructure/api/repositories/artifact.repository";
import {
  MemoryCopilotTransport,
  runCopilotTransportContract,
  type CopilotTransportContractSubject,
} from "@/shared/copilot/testing";
import {
  mapArtifactRecordToCopilotAttachment,
  mapChatApprovalToCopilot,
  mapChatMessageToCopilot,
  mapChatRunToCopilot,
  mapCopilotRunToChat,
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
              });
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
              });
            } else if (event.type === "awaiting-answer") {
              callbacks.onAwaitingUserAnswer?.({
                question: event.request.question,
                inputType: event.request.input,
                options: event.request.options,
              });
            } else if (event.type === "run-status") {
              callbacks.onComplete?.(legacySession);
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
      { type: "data-todos", data: message.todoItems },
      { type: "data-verification", data: message.verificationReports },
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
  it("ignores an all-invalid live approval without transitioning the run", async () => {
    const repository = createRepository({
      subscribeRunEvents: vi.fn(
        async (_run: ChatRun, callbacks: StreamCallbacks) => {
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
          callbacks.onMessageUpdate?.({ content: "Hel", lastEventSeq: 5 });
          callbacks.onMessageUpdate?.({ content: "Hello", lastEventSeq: 5 });
          callbacks.onAwaitingApproval?.({
            actionRequests: [{ name: "publish", args: { id: 1 } }],
            reviewConfigs: [
              { actionName: "publish", allowedDecisions: ["approve", "reject"] },
            ],
          });
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
      { type: "text-delta", delta: "Hel", sequence: 5, messageId: "42" },
      { type: "text-delta", delta: "lo", sequence: 6, messageId: "42" },
      { type: "awaiting-approval", sequence: 7 },
    ]);
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
});
