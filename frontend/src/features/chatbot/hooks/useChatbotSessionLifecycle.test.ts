import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mocked } from "vitest";

import type { ChatbotRepository } from "@/core/ports/chatbot.repository";
import type {
  ChatMessage,
  ChatRun,
  ChatSession,
  ModelInfo,
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

import { useChatbot } from "./useChatbot";

const CREATED_AT = new Date("2026-07-13T00:00:00.000Z");

function makeMessage(
  id: string,
  role: ChatMessage["role"],
  content: string,
): ChatMessage {
  return {
    id,
    role,
    content,
    timestamp: CREATED_AT,
  };
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
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

const models: ModelInfo[] = [
  {
    model_id: "openai-nano",
    display_name: "gpt-5-nano",
    description: "Fast",
    is_default: true,
  },
];

describe("useChatbot session lifecycle characterization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(localStorage.getItem).mockReset().mockReturnValue(null);
    vi.mocked(localStorage.setItem).mockReset();
    vi.mocked(localStorage.removeItem).mockReset();
    vi.mocked(localStorage.clear).mockReset();

    repository.getSessions.mockResolvedValue([]);
    repository.getActiveRuns.mockResolvedValue([]);
    repository.getModels.mockResolvedValue(models);
    repository.createSession.mockResolvedValue(makeSession("created-session"));
    repository.getSession.mockImplementation(async (sessionId) =>
      makeSession(String(sessionId), [
        makeMessage(`message-${sessionId}`, "assistant", "ready"),
      ]),
    );
    repository.deleteSession.mockResolvedValue(undefined);
    repository.renameSession.mockImplementation(async (sessionId, title) => ({
      ...makeSession(String(sessionId)),
      title,
    }));
    repository.subscribeRunEvents.mockResolvedValue(undefined);
  });

  it("does not request sessions when disabled", async () => {
    const { result } = renderHook(() => useChatbot({ enabled: false }));

    await waitFor(() => expect(result.current.isInitializing).toBe(false));
    expect(repository.getSessions).not.toHaveBeenCalled();
    expect(repository.getActiveRuns).not.toHaveBeenCalled();
  });

  it("uses the initial session hint before local storage", async () => {
    const first = makeSession("session-1");
    const hinted = makeSession("session-2");
    vi.mocked(localStorage.getItem).mockImplementation((key) =>
      key === "chatbot_last_session_id" ? "session-1" : null,
    );
    repository.getSessions.mockResolvedValue([first, hinted]);
    repository.getSession.mockResolvedValue({
      ...hinted,
      messages: [makeMessage("message-1", "assistant", "ready")],
    });

    const { result } = renderHook(() =>
      useChatbot({ enabled: true, initialSessionIdHint: "session-2" }),
    );

    await waitFor(() => expect(result.current.currentSessionId).toBe("session-2"));
    expect(repository.getSession).toHaveBeenCalledWith("session-2");
  });

  it("loads the selected session detail in the background", async () => {
    const detail = deferred<ChatSession>();
    repository.getSessions.mockResolvedValue([makeSession("session-1")]);
    repository.getSession.mockReturnValue(detail.promise);

    const { result } = renderHook(() => useChatbot());

    await waitFor(() => {
      expect(result.current.currentSessionId).toBe("session-1");
      expect(result.current.isInitializing).toBe(false);
      expect(result.current.isSessionLoading).toBe(true);
    });

    await act(async () => {
      detail.resolve(
        makeSession("session-1", [
          makeMessage("message-1", "assistant", "loaded"),
        ]),
      );
      await detail.promise;
    });

    await waitFor(() => expect(result.current.isSessionLoading).toBe(false));
    expect(result.current.currentSession?.messages[0]?.content).toBe("loaded");
  });

  it("creates a session when the backend list is empty", async () => {
    const created = makeSession("session-new");
    repository.getSessions.mockResolvedValue([]);
    repository.createSession.mockResolvedValue(created);

    const { result } = renderHook(() => useChatbot());

    await waitFor(() => expect(result.current.isInitializing).toBe(false));
    expect(repository.createSession).toHaveBeenCalledOnce();
    expect(result.current.currentSessionId).toBe("session-new");
    expect(result.current.sessions).toEqual([created]);
    expect(result.current.isLoadingSessions).toBe(false);
    expect(result.current.isSessionLoading).toBe(false);
  });

  it("does not replace the latest selection when an older detail request resolves", async () => {
    const initial = makeSession("session-initial", [
      makeMessage("initial-message", "assistant", "initial"),
    ]);
    const sessionA = makeSession("session-a");
    const sessionB = makeSession("session-b");
    repository.getSessions.mockResolvedValue([initial, sessionA, sessionB]);
    repository.getSession.mockResolvedValue(initial);

    const { result } = renderHook(() => useChatbot());
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    const detailA = deferred<ChatSession>();
    const detailB = deferred<ChatSession>();
    repository.getSession.mockImplementation((sessionId) => {
      if (sessionId === "session-a") return detailA.promise;
      if (sessionId === "session-b") return detailB.promise;
      return Promise.resolve(initial);
    });

    act(() => {
      void result.current.switchSession("session-a");
      void result.current.switchSession("session-b");
    });

    await act(async () => {
      detailB.resolve(
        makeSession("session-b", [
          makeMessage("message-b", "assistant", "latest"),
        ]),
      );
      await detailB.promise;
    });
    await act(async () => {
      detailA.resolve(
        makeSession("session-a", [
          makeMessage("message-a", "assistant", "older"),
        ]),
      );
      await detailA.promise;
    });

    await waitFor(() => expect(result.current.isSessionLoading).toBe(false));
    expect(result.current.currentSessionId).toBe("session-b");
    expect(result.current.currentSession?.id).toBe("session-b");
  });

  it("inserts an unknown session detail only once", async () => {
    const initial = makeSession("session-initial", [
      makeMessage("initial-message", "assistant", "initial"),
    ]);
    repository.getSessions.mockResolvedValue([initial]);
    repository.getSession.mockResolvedValue(initial);

    const { result } = renderHook(() => useChatbot());
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    const unknown = makeSession("session-unknown", [
      makeMessage("unknown-message", "assistant", "unknown"),
    ]);
    const unknownDetail = deferred<ChatSession>();
    repository.getSession.mockReturnValue(unknownDetail.promise);

    act(() => {
      void result.current.switchSession("session-unknown");
      void result.current.switchSession("session-unknown");
    });
    await act(async () => {
      unknownDetail.resolve(unknown);
      await unknownDetail.promise;
    });

    await waitFor(() => expect(result.current.isSessionLoading).toBe(false));
    expect(
      result.current.sessions.filter((session) => session.id === "session-unknown"),
    ).toHaveLength(1);
  });

  it("loads the fallback session after deleting the active session", async () => {
    const active = makeSession("session-active", [
      makeMessage("active-message", "assistant", "active"),
    ]);
    const fallback = makeSession("session-fallback");
    repository.getSessions.mockResolvedValue([active, fallback]);
    repository.getSession.mockResolvedValue(active);

    const { result } = renderHook(() => useChatbot());
    await waitFor(() => expect(result.current.currentSessionId).toBe("session-active"));
    repository.getSession.mockClear();
    repository.getSession.mockResolvedValue(
      makeSession("session-fallback", [
        makeMessage("fallback-message", "assistant", "fallback"),
      ]),
    );

    await act(async () => {
      await result.current.deleteSession("session-active");
    });

    await waitFor(() => {
      expect(repository.getSession).toHaveBeenCalledWith("session-fallback");
      expect(result.current.currentSessionId).toBe("session-fallback");
    });
  });

  it("renames only the matching local session", async () => {
    const first = makeSession("session-1", [
      makeMessage("message-1", "assistant", "first"),
    ]);
    const second = makeSession("session-2", [
      makeMessage("message-2", "assistant", "second"),
    ]);
    repository.getSessions.mockResolvedValue([first, second]);
    repository.getSession.mockResolvedValue(first);

    const { result } = renderHook(() => useChatbot());
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    await act(async () => {
      await result.current.renameSession("session-2", "Renamed");
    });

    expect(repository.renameSession).toHaveBeenCalledWith("session-2", "Renamed");
    expect(result.current.sessions.find((session) => session.id === "session-1")?.title)
      .toBe(first.title);
    expect(result.current.sessions.find((session) => session.id === "session-2")?.title)
      .toBe("Renamed");
  });
});

void makeRun;
