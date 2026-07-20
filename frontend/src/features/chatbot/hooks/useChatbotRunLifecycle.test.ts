import { act, renderHook, waitFor } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mocked,
} from "vitest";

import type { ChatbotRepository } from "@/core/ports/chatbot.repository";
import type {
  ChatMessage,
  ChatRun,
  ChatSession,
  ModelInfo,
  StreamCallbacks,
} from "@/core/types/chatbot.types";

const repository = vi.hoisted(() => ({
  getSessions: vi.fn(),
  getSession: vi.fn(),
  createSession: vi.fn(),
  createBackendSession: vi.fn(),
  deleteSession: vi.fn(),
  renameSession: vi.fn(),
  clearSession: vi.fn(),
  startRun: vi.fn(),
  getActiveRuns: vi.fn(),
  subscribeRunEvents: vi.fn(),
  cancelRun: vi.fn(),
  submitRunApproval: vi.fn(),
  submitRunAnswer: vi.fn(),
  getModels: vi.fn(),
})) as Mocked<ChatbotRepository>;

vi.mock("@/infrastructure/api/repositories", () => ({
  chatbotRepository: repository,
}));

vi.mock("@/infrastructure/api/repositories/artifact.repository", () => ({
  uploadUserArtifact: vi.fn(),
}));

vi.mock("i18next", () => ({
  default: {
    t: (key: string) => key,
  },
}));

import { useChatbot } from "./useChatbot";

const CREATED_AT = new Date("2026-07-13T00:00:00.000Z");

function makeMessage(
  id: string,
  role: ChatMessage["role"],
  content: string,
): ChatMessage {
  return { id, role, content, timestamp: CREATED_AT };
}

function makeSession(id: string, messages: ChatMessage[] = []): ChatSession {
  return {
    id,
    title: `Session ${id}`,
    messages,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

function makeRun(overrides: Partial<ChatRun> = {}): ChatRun {
  return {
    id: "run-1",
    sessionId: "session-1",
    status: "running",
    kind: "chat",
    modelId: "openai-nano",
    lastEventSeq: 0,
    assistantMessageId: 42,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

const models: ModelInfo[] = [
  {
    model_id: "openai-nano",
    display_name: "gpt-5-nano",
    description: "Fast",
    is_default: true,
  },
];

async function renderActiveRun(runOrRuns: ChatRun | ChatRun[] = makeRun()) {
  const runs = Array.isArray(runOrRuns) ? runOrRuns : [runOrRuns];
  const sessionId = runs[0].sessionId;
  let callbacks: StreamCallbacks | undefined;
  const signals: AbortSignal[] = [];
  repository.getSessions.mockResolvedValue([makeSession(sessionId)]);
  repository.getActiveRuns.mockResolvedValue(runs);
  repository.getSession.mockResolvedValue(makeSession(sessionId));
  repository.subscribeRunEvents.mockImplementation(
    async (_subscribedRun, nextCallbacks, options) => {
      callbacks = nextCallbacks;
      if (options?.signal) signals.push(options.signal);
      await new Promise<void>((resolve) => {
        options?.signal?.addEventListener("abort", () => resolve(), { once: true });
      });
    },
  );

  const hook = renderHook(() => useChatbot());
  await waitFor(() => {
    expect(repository.subscribeRunEvents).toHaveBeenCalledOnce();
    expect(callbacks).toBeDefined();
  });

  return {
    ...hook,
    get callbacks() {
      if (!callbacks) throw new Error("Stream callbacks were not captured");
      return callbacks;
    },
    signals,
  };
}

describe("useChatbot run lifecycle characterization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(localStorage.getItem).mockReset().mockReturnValue(null);
    vi.mocked(localStorage.setItem).mockReset();
    repository.getModels.mockResolvedValue(models);
    repository.createSession.mockResolvedValue(makeSession("created-session"));
    repository.subscribeRunEvents.mockResolvedValue(undefined);
    repository.cancelRun.mockResolvedValue(
      makeRun({ status: "cancelled" }),
    );
    repository.submitRunApproval.mockResolvedValue(makeRun());
    repository.submitRunAnswer.mockResolvedValue(makeRun());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("streams into one assistant draft while preserving tool history", async () => {
    const { result, callbacks } = await renderActiveRun();

    expect(result.current.isStreaming).toBe(true);
    expect(result.current.isLoading).toBe(true);

    act(() => {
      callbacks.onMessageUpdate?.({
        content: "Hello",
        toolExecutions: [
          { toolName: "search", toolCallId: "tool-1", result: "found" },
        ],
        runStatus: "running",
        lastEventSeq: 3,
      });
    });
    act(() => {
      callbacks.onMessageUpdate?.({
        content: "Hello world",
        toolExecutions: [
          { toolName: "write", toolCallId: "tool-2", result: "saved" },
        ],
        runStatus: "running",
        lastEventSeq: 4,
      });
    });

    const assistant = result.current.currentSession?.messages.find(
      (message) => message.role === "assistant",
    );
    expect(assistant).toMatchObject({
      content: "Hello world",
      runId: "run-1",
      runStatus: "running",
      lastEventSeq: 4,
    });
    expect(assistant?.toolExecutions?.map((tool) => tool.toolCallId)).toEqual([
      "tool-1",
      "tool-2",
    ]);
  });

  it("does not reopen the subscription when approval is requested", async () => {
    const { result, callbacks } = await renderActiveRun();

    act(() => {
      callbacks.onAwaitingApproval?.({
        actionRequests: [{ name: "write" }],
      });
    });

    expect(result.current.pendingApproval).toEqual({
      actionRequests: [{ name: "write" }],
    });
    expect(result.current.isLoading).toBe(false);
    expect(repository.subscribeRunEvents).toHaveBeenCalledOnce();
  });

  it("keeps the approval card when submit approval fails", async () => {
    const { result, callbacks } = await renderActiveRun();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    act(() => {
      callbacks.onAwaitingApproval?.({
        actionRequests: [{ name: "write" }],
      });
    });
    repository.submitRunApproval.mockRejectedValue(new Error("offline"));

    await act(async () => {
      await result.current.submitApproval("approve");
    });

    expect(result.current.pendingApproval).toEqual({
      actionRequests: [{ name: "write" }],
    });
    expect(result.current.error).toBeTruthy();
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(consoleError).toHaveBeenCalledWith("Resume run error:", expect.any(Error));
  });

  it("resubscribes to the same run after a successful approval", async () => {
    const view = await renderActiveRun();
    const firstSignal = view.signals[0];
    act(() => {
      view.callbacks.onAwaitingApproval?.({
        actionRequests: [{ name: "write" }],
      });
    });
    repository.submitRunApproval.mockResolvedValue(
      makeRun({ kind: "resume", lastEventSeq: 8 }),
    );

    await act(async () => {
      await view.result.current.submitApproval("approve");
    });

    await waitFor(() =>
      expect(repository.subscribeRunEvents).toHaveBeenCalledTimes(2),
    );
    expect(firstSignal.aborted).toBe(true);
    expect(view.signals[1]?.aborted).toBe(false);
    expect(view.result.current.pendingApproval).toBeNull();
  });

  it("retains the pending question payload until the user acts", async () => {
    const { result, callbacks } = await renderActiveRun();

    act(() => {
      callbacks.onAwaitingUserAnswer?.({
        question: "Continue?",
        options: ["yes", "no"],
        inputType: "choice",
      });
    });

    expect(result.current.pendingQuestion).toEqual({
      question: "Continue?",
      options: ["yes", "no"],
      inputType: "choice",
    });
    expect(result.current.isLoading).toBe(false);
    expect(repository.subscribeRunEvents).toHaveBeenCalledOnce();
  });

  it("restores a persisted pending question after reload", async () => {
    const { result } = await renderActiveRun(
      makeRun({
        status: "awaiting_user_answer",
        lastEventSeq: 25,
        questionPayload: {
          question: "Which rubric should I use?",
          options: [],
          input_type: "text",
        },
      }),
    );

    expect(result.current.pendingQuestion).toEqual({
      question: "Which rubric should I use?",
      options: [],
      inputType: "text",
    });
    expect(result.current.isLoading).toBe(false);
  });

  it("prefers an awaiting question over a queued run after reload", async () => {
    const queuedRun = makeRun({ id: "run-queued", status: "queued" });
    const awaitingRun = makeRun({
      id: "run-awaiting",
      status: "awaiting_user_answer",
      lastEventSeq: 25,
      questionPayload: {
        question: "Which rubric should I use?",
        input_type: "text",
      },
    });

    const { result } = await renderActiveRun([queuedRun, awaitingRun]);

    expect(repository.subscribeRunEvents).toHaveBeenCalledWith(
      expect.objectContaining({ id: "run-awaiting" }),
      expect.any(Object),
      expect.any(Object),
    );
    expect(result.current.pendingQuestion?.question).toBe(
      "Which rubric should I use?",
    );
  });

  it("routes composer text to the pending question instead of queuing a run", async () => {
    const awaitingRun = makeRun({
      id: "run-awaiting",
      status: "awaiting_user_answer",
      lastEventSeq: 25,
      questionPayload: {
        question: "Which rubric should I use?",
        input_type: "text",
      },
    });
    const view = await renderActiveRun(awaitingRun);
    repository.startRun.mockResolvedValue(
      makeRun({ id: "run-queued", status: "queued" }),
    );
    repository.submitRunAnswer.mockResolvedValue(
      makeRun({ id: "run-awaiting", kind: "resume", lastEventSeq: 25 }),
    );

    await act(async () => {
      await view.result.current.sendMessage("Use the existing answer as rubric");
    });

    expect(repository.submitRunAnswer).toHaveBeenCalledWith(
      "run-awaiting",
      "Use the existing answer as rubric",
    );
    expect(repository.startRun).not.toHaveBeenCalled();
  });

  it("aborts the current subscription on unmount", async () => {
    const { unmount, signals } = await renderActiveRun();
    const subscriptionSignal = signals[0];

    unmount();

    expect(subscriptionSignal.aborted).toBe(true);
  });

  it("does not let an older cancel completion abort the next subscription", async () => {
    const view = await renderActiveRun();
    const firstSignal = view.signals[0];
    const cancel = deferred<ChatRun>();
    const nextRun = makeRun({ id: "run-2", assistantMessageId: 84 });
    repository.cancelRun.mockReturnValue(cancel.promise);
    repository.startRun.mockResolvedValue(nextRun);
    repository.getSession.mockResolvedValue(
      makeSession("session-1", [
        makeMessage("user-1", "user", "next"),
      ]),
    );

    act(() => view.result.current.stopStreaming());
    expect(firstSignal.aborted).toBe(true);
    expect(repository.cancelRun).toHaveBeenCalledWith("run-1");

    await act(async () => {
      await view.result.current.sendMessage("next");
    });
    await waitFor(() =>
      expect(repository.subscribeRunEvents).toHaveBeenCalledTimes(2),
    );
    const secondSignal = view.signals[1];
    expect(secondSignal.aborted).toBe(false);

    await act(async () => {
      cancel.resolve(makeRun({ status: "cancelled" }));
      await cancel.promise;
    });
    await waitFor(() => expect(repository.getSession).toHaveBeenCalled());

    expect(secondSignal.aborted).toBe(false);
  });
});
