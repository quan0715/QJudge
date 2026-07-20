import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  CopilotAttachmentPart,
  CopilotRun,
  CopilotSession,
  CopilotSessionSummary,
} from "@/core/copilot";
import {
  MemoryCopilotSessionLocation,
  MemoryCopilotStorage,
  MemoryCopilotTransport,
} from "../testing";
import { useCopilotSessions } from "../hooks/useCopilotSessions";
import { useCopilotComposer } from "../hooks/useCopilotComposer";
import { useCopilotStateContext } from "./copilotContexts";
import { CopilotProvider } from "./CopilotProvider";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function createWrapper(
  props: Omit<React.ComponentProps<typeof CopilotProvider>, "children">,
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <CopilotProvider {...props}>{children}</CopilotProvider>;
  };
}

describe("CopilotProvider session lifecycle", () => {
  it("does not make requests while disabled", () => {
    const transport = new MemoryCopilotTransport();
    const listSessions = vi.spyOn(transport, "listSessions");
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, enabled: false }),
    });

    expect(result.current.listStatus).toBe("idle");
    expect(result.current.activeSession.status).toBe("empty");
    expect(listSessions).not.toHaveBeenCalled();
  });

  it("prefers a valid location ID over stored selection", async () => {
    const transport = new MemoryCopilotTransport();
    const stored = await transport.createSession({ title: "Stored" });
    const located = await transport.createSession({ title: "Located" });
    const location = new MemoryCopilotSessionLocation(located.id);
    const storage = new MemoryCopilotStorage([
      ["copilot:last-session-id", stored.id],
    ]);
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({
        transport,
        sessionLocation: location,
        storage,
        initialSession: "first",
      }),
    });

    await waitFor(() => expect(result.current.activeSession.status).toBe("ready"));
    expect(result.current.activeSession.id).toBe(located.id);
  });

  it("clears an invalid location and falls back to a valid stored ID", async () => {
    const transport = new MemoryCopilotTransport();
    const stored = await transport.createSession({ title: "Stored" });
    const location = new MemoryCopilotSessionLocation("missing");
    const storage = new MemoryCopilotStorage([
      ["copilot:last-session-id", stored.id],
    ]);
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, sessionLocation: location, storage }),
    });

    await waitFor(() => expect(result.current.activeSession.status).toBe("ready"));
    expect(result.current.activeSession.id).toBe(stored.id);
    expect(location.get()).toBe(stored.id);
  });

  it.each(["first", "none"] as const)(
    "applies the %s initial selection policy",
    async (initialSession) => {
      const transport = new MemoryCopilotTransport();
      const first = await transport.createSession({ title: "First" });
      const { result } = renderHook(() => useCopilotSessions(), {
        wrapper: createWrapper({ transport, initialSession }),
      });

      await waitFor(() => expect(result.current.listStatus).toBe("ready"));
      if (initialSession === "first") {
        await waitFor(() =>
          expect(result.current.activeSession.status).toBe("ready"),
        );
        expect(result.current.activeSession.id).toBe(first.id);
      } else {
        expect(result.current.activeSession.status).toBe("empty");
      }
    },
  );

  it("creates a session for the create policy", async () => {
    const transport = new MemoryCopilotTransport();
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, initialSession: "create" }),
    });

    await waitFor(() => expect(result.current.activeSession.status).toBe("ready"));
    expect(result.current.sessions).toHaveLength(1);
  });

  it("selects the first listed session without creating another one", async () => {
    const transport = new MemoryCopilotTransport();
    const existing = await transport.createSession({ title: "Existing" });
    const create = vi.spyOn(transport, "createSession");

    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, initialSession: "first-or-create" }),
    });

    await waitFor(() => expect(result.current.activeSession.id).toBe(existing.id));
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps session state and exposes an error when rename fails", async () => {
    const transport = new MemoryCopilotTransport();
    const existing = await transport.createSession({ title: "Existing" });
    vi.spyOn(transport, "renameSession").mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, initialSession: "first" }),
    });
    await waitFor(() => expect(result.current.activeSession.id).toBe(existing.id));

    await act(async () => result.current.rename(existing.id, "Changed"));

    expect(result.current.sessions[0]?.title).toBe("Existing");
    expect(result.current.error?.operation).toBe("update-session");
  });

  it("loads a located session that is absent from the listed sessions", async () => {
    const transport = new MemoryCopilotTransport();
    const hidden = await transport.createSession({ title: "Hidden" });
    vi.spyOn(transport, "listSessions").mockResolvedValue([]);
    const create = vi.spyOn(transport, "createSession");
    const location = new MemoryCopilotSessionLocation(hidden.id);

    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({
        transport,
        sessionLocation: location,
        initialSession: "first-or-create",
      }),
    });

    await waitFor(() => expect(result.current.activeSession.id).toBe(hidden.id));
    expect(result.current.sessions.map((session) => session.id)).toEqual([
      hidden.id,
    ]);
    expect(create).not.toHaveBeenCalled();
  });

  it("commits the bootstrap list after UI selection before list completion", async () => {
    const transport = new MemoryCopilotTransport();
    const first = await transport.createSession({ title: "First" });
    const second = await transport.createSession({ title: "Second" });
    const listed = await transport.listSessions();
    const pendingList = deferred<CopilotSessionSummary[]>();
    vi.spyOn(transport, "listSessions").mockReturnValueOnce(pendingList.promise);
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, initialSession: "none" }),
    });

    await act(async () => result.current.select(second.id));
    await act(async () => {
      pendingList.resolve(listed);
      await pendingList.promise;
    });

    await waitFor(() => expect(result.current.listStatus).toBe("ready"));
    expect(result.current.activeSession.id).toBe(second.id);
    expect(result.current.sessions.map((session) => session.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it("settles the bootstrap list after UI selection during a located load", async () => {
    const transport = new MemoryCopilotTransport();
    const first = await transport.createSession({ title: "First" });
    const second = await transport.createSession({ title: "Second" });
    const firstLoad = deferred<CopilotSession>();
    const originalGet = transport.getSession.bind(transport);
    const getSession = vi
      .spyOn(transport, "getSession")
      .mockImplementation((id) =>
        id === first.id ? firstLoad.promise : originalGet(id),
      );
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({
        transport,
        sessionLocation: new MemoryCopilotSessionLocation(first.id),
      }),
    });
    await waitFor(() => expect(getSession).toHaveBeenCalledWith(first.id, expect.any(Object)));

    await act(async () => result.current.select(second.id));
    await act(async () => {
      firstLoad.resolve(first);
      await firstLoad.promise;
    });

    await waitFor(() => expect(result.current.listStatus).toBe("ready"));
    expect(result.current.activeSession.id).toBe(second.id);
    expect(result.current.sessions.map((session) => session.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it("ignores stale bootstrap completion after an external location change", async () => {
    const transport = new MemoryCopilotTransport();
    const first = await transport.createSession({ title: "First" });
    const second = await transport.createSession({ title: "Second" });
    const location = new MemoryCopilotSessionLocation(first.id);
    const firstLoad = deferred<CopilotSession>();
    const originalGet = transport.getSession.bind(transport);
    let bootstrapSignal: AbortSignal | undefined;
    const getSession = vi
      .spyOn(transport, "getSession")
      .mockImplementation((id, options) => {
        if (id !== first.id) return originalGet(id);
        bootstrapSignal = options?.signal;
        return firstLoad.promise;
      });
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, sessionLocation: location }),
    });
    await waitFor(() =>
      expect(getSession).toHaveBeenCalledWith(
        first.id,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );

    act(() => location.set(second.id));
    await waitFor(() => expect(result.current.activeSession.id).toBe(second.id));
    expect(bootstrapSignal?.aborted).toBe(true);

    await act(async () => {
      firstLoad.resolve(first);
      await firstLoad.promise;
    });

    expect(location.get()).toBe(second.id);
    expect(result.current.activeSession.id).toBe(second.id);
    expect(result.current.listStatus).toBe("ready");
  });

  it("retains a recoverably failing location as the active load error", async () => {
    const transport = new MemoryCopilotTransport();
    const location = new MemoryCopilotSessionLocation("session-offline");
    vi.spyOn(transport, "getSession").mockRejectedValue(
      Object.assign(new Error("offline"), {
        code: "transport-error",
        operation: "load-session",
        recoverable: true,
      }),
    );

    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, sessionLocation: location }),
    });

    await waitFor(() => expect(result.current.activeSession.status).toBe("error"));
    expect(result.current.activeSession.id).toBe("session-offline");
    expect(location.get()).toBe("session-offline");
    expect(result.current.error).toBeNull();

    act(() => result.current.clearError());
    expect(result.current.activeSession.status).toBe("error");
  });

  it("keeps session state and returns null when create fails", async () => {
    const transport = new MemoryCopilotTransport();
    const existing = await transport.createSession({ title: "Existing" });
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, initialSession: "first" }),
    });
    await waitFor(() => expect(result.current.activeSession.id).toBe(existing.id));
    vi.spyOn(transport, "createSession").mockRejectedValue(new Error("offline"));

    let created: string | null = "pending";
    await act(async () => {
      created = await result.current.create();
    });

    expect(created).toBeNull();
    expect(result.current.sessions.map((session) => session.id)).toEqual([
      existing.id,
    ]);
    expect(result.current.activeSession.id).toBe(existing.id);
    expect(result.current.error?.operation).toBe("create-session");
  });

  it("keeps session state and exposes an error when remove fails", async () => {
    const transport = new MemoryCopilotTransport();
    const existing = await transport.createSession({ title: "Existing" });
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, initialSession: "first" }),
    });
    await waitFor(() => expect(result.current.activeSession.id).toBe(existing.id));
    vi.spyOn(transport, "deleteSession").mockRejectedValue(new Error("offline"));

    await act(async () => result.current.remove(existing.id));

    expect(result.current.sessions.map((session) => session.id)).toEqual([
      existing.id,
    ]);
    expect(result.current.activeSession.id).toBe(existing.id);
    expect(result.current.error?.operation).toBe("update-session");
  });

  it("keeps session state and exposes an error when refresh fails", async () => {
    const transport = new MemoryCopilotTransport();
    const existing = await transport.createSession({ title: "Existing" });
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, initialSession: "first" }),
    });
    await waitFor(() => expect(result.current.activeSession.id).toBe(existing.id));
    vi.spyOn(transport, "listSessions").mockRejectedValue(new Error("offline"));

    await act(async () => result.current.refresh());

    expect(result.current.sessions.map((session) => session.id)).toEqual([
      existing.id,
    ]);
    expect(result.current.activeSession.id).toBe(existing.id);
    expect(result.current.error?.operation).toBe("load-sessions");

    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it("does not let a stale refresh overwrite a newly created session", async () => {
    const transport = new MemoryCopilotTransport();
    const existing = await transport.createSession({ title: "Existing" });
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, initialSession: "first" }),
    });
    await waitFor(() => expect(result.current.activeSession.id).toBe(existing.id));
    const staleList = deferred<CopilotSessionSummary[]>();
    let staleSignal: AbortSignal | undefined;
    vi.spyOn(transport, "listSessions").mockImplementationOnce((options) => {
      staleSignal = options?.signal;
      return staleList.promise;
    });

    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = result.current.refresh();
    });
    await waitFor(() => expect(result.current.listStatus).toBe("loading"));
    let createdId: string | null = null;
    await act(async () => {
      createdId = await result.current.create({ title: "Created" });
    });
    expect(staleSignal?.aborted).toBe(true);

    await act(async () => {
      staleList.resolve([existing]);
      await refreshPromise;
    });

    expect(result.current.sessions.map((session) => session.id)).toContain(
      createdId,
    );
    expect(result.current.listStatus).toBe("ready");
    expect(result.current.error).toBeNull();
  });

  it("merges a stale create without superseding a newer refresh or selection", async () => {
    const transport = new MemoryCopilotTransport();
    const first = await transport.createSession({ title: "First" });
    const second = await transport.createSession({ title: "Second" });
    const createResult = deferred<CopilotSession>();
    const originalCreate = transport.createSession.bind(transport);
    vi.spyOn(transport, "createSession").mockReturnValueOnce(createResult.promise);
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, initialSession: "first" }),
    });
    await waitFor(() => expect(result.current.activeSession.id).toBe(first.id));

    let createPromise!: Promise<string | null>;
    act(() => {
      createPromise = result.current.create({ title: "Created" });
    });
    await act(async () => result.current.select(second.id));

    const newerList = deferred<CopilotSessionSummary[]>();
    let newerSignal: AbortSignal | undefined;
    vi.spyOn(transport, "listSessions").mockImplementationOnce((options) => {
      newerSignal = options?.signal;
      return newerList.promise;
    });
    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = result.current.refresh();
    });
    const created = await originalCreate({ title: "Created" });
    await act(async () => {
      createResult.resolve(created);
      await createPromise;
    });

    expect(result.current.activeSession.id).toBe(second.id);
    expect(result.current.sessions.map((session) => session.id)).toContain(
      created.id,
    );
    expect(newerSignal?.aborted).toBe(false);
    expect(result.current.listStatus).toBe("loading");

    const refreshedCreated = { ...created, title: "Created from refresh" };
    await act(async () => {
      newerList.resolve([first, second, refreshedCreated]);
      await refreshPromise;
    });

    expect(
      result.current.sessions.find((session) => session.id === created.id)?.title,
    ).toBe("Created from refresh");
    expect(result.current.activeSession.id).toBe(second.id);
    expect(result.current.listStatus).toBe("ready");
  });

  it("does not let an older refresh failure overwrite a newer success", async () => {
    const transport = new MemoryCopilotTransport();
    const existing = await transport.createSession({ title: "Existing" });
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, initialSession: "first" }),
    });
    await waitFor(() => expect(result.current.activeSession.id).toBe(existing.id));
    const older = deferred<CopilotSessionSummary[]>();
    const newer = deferred<CopilotSessionSummary[]>();
    let olderSignal: AbortSignal | undefined;
    vi.spyOn(transport, "listSessions")
      .mockImplementationOnce((options) => {
        olderSignal = options?.signal;
        return older.promise;
      })
      .mockReturnValueOnce(newer.promise);

    let olderRefresh!: Promise<void>;
    let newerRefresh!: Promise<void>;
    act(() => {
      olderRefresh = result.current.refresh();
      newerRefresh = result.current.refresh();
    });
    expect(olderSignal?.aborted).toBe(true);
    await act(async () => {
      newer.resolve([existing]);
      await newerRefresh;
    });
    await act(async () => {
      older.reject(new Error("older offline"));
      await olderRefresh;
    });

    expect(result.current.sessions.map((session) => session.id)).toEqual([
      existing.id,
    ]);
    expect(result.current.listStatus).toBe("ready");
    expect(result.current.error).toBeNull();
  });

  it("restores an active run from its last sequence", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    const run = await transport.startRun({ sessionId: session.id, text: "Hi" });
    transport.emit(run.id, {
      type: "run-status",
      runId: run.id,
      sessionId: session.id,
      sequence: 9,
      status: "running",
    });
    const subscribeRun = vi.spyOn(transport, "subscribeRun");
    const location = new MemoryCopilotSessionLocation(session.id);
    const { result } = renderHook(
      () => ({ sessions: useCopilotSessions(), state: useCopilotStateContext() }),
      {
        wrapper: createWrapper({ transport, sessionLocation: location }),
      },
    );

    await waitFor(() => expect(result.current.sessions.activeSession.status).toBe("ready"));
    await waitFor(() => expect(result.current.state.run.status).toBe("streaming"));
    expect(subscribeRun).toHaveBeenCalledWith(
      expect.objectContaining({ id: run.id }),
      expect.any(Object),
      expect.objectContaining({ fromSequence: 9 }),
    );
  });

  it("restores a persisted awaiting-answer request after reload", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    const started = await transport.startRun({ sessionId: session.id, text: "Grade it" });
    const questionRequest = {
      question: "Which rubric should I use?",
      input: "text" as const,
      options: [],
    };
    const awaitingRun = {
      ...started,
      status: "awaiting-answer" as const,
      lastSequence: 25,
      questionRequest,
    } satisfies CopilotRun & { questionRequest: typeof questionRequest };
    vi.spyOn(transport, "getActiveRun").mockResolvedValue(awaitingRun);
    const location = new MemoryCopilotSessionLocation(session.id);
    const { result } = renderHook(
      () => ({ sessions: useCopilotSessions(), state: useCopilotStateContext() }),
      {
        wrapper: createWrapper({ transport, sessionLocation: location }),
      },
    );

    await waitFor(() => expect(result.current.sessions.activeSession.status).toBe("ready"));
    await waitFor(() => expect(result.current.state.run.status).toBe("awaiting-answer"));
    expect(result.current.state.run).toMatchObject({
      status: "awaiting-answer",
      request: questionRequest,
    });
  });

  it("restores a persisted awaiting-approval request after reload", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    const started = await transport.startRun({
      sessionId: session.id,
      text: "Deploy it",
    });
    const approvalRequest = {
      actions: [{ name: "deploy", arguments: { environment: "staging" } }],
      allowedDecisions: ["approve", "reject"] as const,
    };
    const awaitingRun = {
      ...started,
      status: "awaiting-approval" as const,
      lastSequence: 26,
      approvalRequest: {
        ...approvalRequest,
        allowedDecisions: [...approvalRequest.allowedDecisions],
      },
    } satisfies CopilotRun;
    vi.spyOn(transport, "getActiveRun").mockResolvedValue(awaitingRun);
    const location = new MemoryCopilotSessionLocation(session.id);
    const { result } = renderHook(
      () => ({ sessions: useCopilotSessions(), state: useCopilotStateContext() }),
      {
        wrapper: createWrapper({ transport, sessionLocation: location }),
      },
    );

    await waitFor(() =>
      expect(result.current.sessions.activeSession.status).toBe("ready"),
    );
    await waitFor(() =>
      expect(result.current.state.run.status).toBe("awaiting-approval"),
    );
    expect(result.current.state.run).toMatchObject({
      status: "awaiting-approval",
      request: approvalRequest,
    });
  });

  it("only commits the latest fast session selection", async () => {
    const transport = new MemoryCopilotTransport();
    const first = await transport.createSession({ title: "First" });
    const second = await transport.createSession({ title: "Second" });
    const originalGet = transport.getSession.bind(transport);
    let releaseFirst = () => {};
    vi.spyOn(transport, "getSession").mockImplementation(async (id) => {
      if (id === first.id) await new Promise<void>((resolve) => (releaseFirst = resolve));
      return originalGet(id);
    });
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, initialSession: "none" }),
    });
    await waitFor(() => expect(result.current.listStatus).toBe("ready"));

    let slowSelection: Promise<void>;
    act(() => {
      slowSelection = result.current.select(first.id);
    });
    await act(() => result.current.select(second.id));
    releaseFirst();
    await act(() => slowSelection!);

    expect(result.current.activeSession.id).toBe(second.id);
  });

  it("responds to external location changes", async () => {
    const transport = new MemoryCopilotTransport();
    const first = await transport.createSession({ title: "First" });
    const second = await transport.createSession({ title: "Second" });
    const location = new MemoryCopilotSessionLocation(first.id);
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, sessionLocation: location }),
    });
    await waitFor(() => expect(result.current.activeSession.id).toBe(first.id));

    act(() => location.set(second.id));

    await waitFor(() => expect(result.current.activeSession.id).toBe(second.id));
  });

  it("renames and removes sessions through the transport", async () => {
    const transport = new MemoryCopilotTransport();
    const first = await transport.createSession({ title: "First" });
    const second = await transport.createSession({ title: "Second" });
    const location = new MemoryCopilotSessionLocation(first.id);
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, sessionLocation: location }),
    });
    await waitFor(() => expect(result.current.activeSession.status).toBe("ready"));

    await act(() => result.current.rename(first.id, "Renamed"));
    expect(result.current.sessions.find((item) => item.id === first.id)?.title).toBe(
      "Renamed",
    );
    await act(() => result.current.remove(first.id));

    expect(result.current.sessions.map((item) => item.id)).toEqual([second.id]);
    await waitFor(() => expect(result.current.activeSession.id).toBe(second.id));
  });

  it("closes a restored subscription when unmounted", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    await transport.startRun({ sessionId: session.id, text: "Hi" });
    const subscribeRun = vi.spyOn(transport, "subscribeRun");
    const { result, unmount } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({
        transport,
        sessionLocation: new MemoryCopilotSessionLocation(session.id),
      }),
    });
    await waitFor(() => expect(result.current.activeSession.status).toBe("ready"));
    await waitFor(() => expect(subscribeRun).toHaveBeenCalled());
    const subscription = subscribeRun.mock.results[0].value;

    unmount();

    expect(subscription.closed).toBe(true);
  });
});

describe("CopilotProvider composer lifecycle", () => {
  it("shares one in-flight send across rapid duplicate submissions", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    const uploadResult = deferred<CopilotAttachmentPart>();
    const uploadAttachment = vi
      .spyOn(transport, "uploadAttachment")
      .mockReturnValue(uploadResult.promise);
    const startRun = vi.spyOn(transport, "startRun");
    const { result } = renderHook(() => useCopilotComposer(), {
      wrapper: createWrapper({
        transport,
        sessionLocation: new MemoryCopilotSessionLocation(session.id),
      }),
    });
    await waitFor(() => expect(result.current.canSend).toBe(false));
    const file = new File(["data"], "grade.csv", { type: "text/csv" });
    await act(() => result.current.addAttachments([file]));
    await waitFor(() => expect(result.current.canSend).toBe(true));

    let first!: ReturnType<typeof result.current.send>;
    let second!: ReturnType<typeof result.current.send>;
    act(() => {
      first = result.current.send();
      second = result.current.send();
    });
    expect(uploadAttachment).toHaveBeenCalledTimes(1);

    await act(async () => {
      uploadResult.resolve({
        type: "attachment",
        id: "attachment-1",
        name: file.name,
      });
      const results = await Promise.all([first, second]);
      expect(results[0]).toEqual(results[1]);
    });

    expect(startRun).toHaveBeenCalledTimes(1);
    expect(result.current.attachments).toEqual([]);
    expect(result.current.draft).toBe("");
  });

  it("retries an attachment after an upload error", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    const uploadAttachment = vi
      .spyOn(transport, "uploadAttachment")
      .mockRejectedValueOnce(new Error("Upload offline"))
      .mockResolvedValueOnce({
        type: "attachment",
        id: "attachment-1",
        name: "grade.csv",
      });
    const startRun = vi.spyOn(transport, "startRun");
    const { result } = renderHook(() => useCopilotComposer(), {
      wrapper: createWrapper({
        transport,
        sessionLocation: new MemoryCopilotSessionLocation(session.id),
      }),
    });
    const file = new File(["data"], "grade.csv", { type: "text/csv" });
    await act(() => result.current.addAttachments([file]));
    await waitFor(() => expect(result.current.canSend).toBe(true));

    let firstResult;
    await act(async () => {
      firstResult = await result.current.send();
    });
    expect(firstResult).toMatchObject({ accepted: false });
    expect(result.current.attachments[0]).toMatchObject({ status: "error" });

    let retryResult;
    await act(async () => {
      retryResult = await result.current.send();
    });
    expect(retryResult).toMatchObject({ accepted: true });
    expect(uploadAttachment).toHaveBeenCalledTimes(2);
    expect(startRun).toHaveBeenCalledTimes(1);
    expect(result.current.attachments).toEqual([]);
  });
});
