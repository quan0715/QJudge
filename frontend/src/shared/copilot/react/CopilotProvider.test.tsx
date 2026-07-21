import { act, render, renderHook, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  CopilotAttachmentPart,
  CopilotRun,
  CopilotRunObserver,
  CopilotSession,
  CopilotSessionSummary,
  CopilotSubscription,
} from "@/core/copilot";
import {
  MemoryCopilotModelCatalog,
  MemoryCopilotSessionLocation,
  MemoryCopilotStorage,
  MemoryCopilotTransport,
} from "../testing";
import { useCopilotSessions } from "../hooks/useCopilotSessions";
import { useCopilotComposer } from "../hooks/useCopilotComposer";
import { useCopilotModels } from "../hooks/useCopilotModels";
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

type ProviderProbeSnapshot = {
  state: ReturnType<typeof useCopilotStateContext>;
  sessions: ReturnType<typeof useCopilotSessions>;
  composer: ReturnType<typeof useCopilotComposer>;
  models: ReturnType<typeof useCopilotModels>;
};

function createProviderProbe() {
  const snapshotRef: { current: ProviderProbeSnapshot | null } = {
    current: null,
  };
  function ProviderProbe() {
    const state = useCopilotStateContext();
    const sessions = useCopilotSessions();
    const composer = useCopilotComposer();
    const models = useCopilotModels();
    useEffect(() => {
      snapshotRef.current = { state, sessions, composer, models };
    });
    return null;
  }
  return { snapshot: snapshotRef, ProviderProbe };
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

  it("atomically clears account-owned runtime state when disabled", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession({ title: "Old account" });
    const location = new MemoryCopilotSessionLocation(session.id);
    const storage = new MemoryCopilotStorage([
      ["copilot:last-session-id", session.id],
    ]);
    const modelCatalog = new MemoryCopilotModelCatalog([
      { id: "old-model", displayName: "Old model", isDefault: true },
    ]);
    const subscribeRun = vi.spyOn(transport, "subscribeRun");
    const { snapshot, ProviderProbe } = createProviderProbe();
    const view = render(
      <CopilotProvider
        transport={transport}
        sessionLocation={location}
        storage={storage}
        modelCatalog={modelCatalog}
        initialSession="first"
      >
        <ProviderProbe />
      </CopilotProvider>,
    );
    await waitFor(() =>
      expect(snapshot.current?.sessions.activeSession.id).toBe(session.id),
    );
    await waitFor(() => expect(snapshot.current?.models.status).toBe("ready"));
    act(() => snapshot.current?.composer.setDraft("Old account message"));
    await waitFor(() => expect(snapshot.current?.composer.canSend).toBe(true));
    await act(() => snapshot.current!.composer.send());
    await act(() =>
      snapshot.current!.composer.addAttachments([
        new File(["old"], "old-account.txt", { type: "text/plain" }),
      ]),
    );
    act(() => snapshot.current?.composer.setDraft("Old private draft"));
    vi.spyOn(transport, "renameSession").mockRejectedValueOnce(
      new Error("old account error"),
    );
    await act(() => snapshot.current!.sessions.rename(session.id, "Fail"));
    expect(snapshot.current?.sessions.activeSession.data?.messages.length).toBeGreaterThan(0);
    expect(snapshot.current?.state.run.status).not.toBe("ready");
    expect(snapshot.current?.sessions.error).not.toBeNull();
    const subscription = subscribeRun.mock.results.at(-1)?.value;

    view.rerender(
      <CopilotProvider
        transport={transport}
        sessionLocation={location}
        storage={storage}
        modelCatalog={modelCatalog}
        initialSession="first"
        enabled={false}
      >
        <ProviderProbe />
      </CopilotProvider>,
    );

    expect(snapshot.current?.sessions.sessions).toEqual([]);
    expect(snapshot.current?.sessions.listStatus).toBe("idle");
    expect(snapshot.current?.sessions.error).toBeNull();
    expect(snapshot.current?.sessions.activeSession).toEqual({
      status: "empty",
      id: null,
      data: null,
      error: null,
    });
    expect(snapshot.current?.state.run).toEqual({ status: "ready", run: null });
    expect(snapshot.current?.composer).toMatchObject({
      draft: "",
      attachments: [],
      canSend: false,
      isSending: false,
    });
    expect(snapshot.current?.models).toMatchObject({
      models: [],
      status: "idle",
      selectedModelId: null,
      error: null,
    });
    expect(location.get()).toBeNull();
    expect(storage.get("copilot:last-session-id")).toBeNull();
    expect(subscription?.closed).toBe(true);
  });

  it("does not revive a disabled runtime from an old in-flight send", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession({ title: "Old account" });
    const pendingRun = deferred<CopilotRun>();
    const startRun = vi
      .spyOn(transport, "startRun")
      .mockReturnValueOnce(pendingRun.promise);
    const subscribeRun = vi.spyOn(transport, "subscribeRun");
    const { snapshot, ProviderProbe } = createProviderProbe();
    const view = render(
      <CopilotProvider transport={transport} initialSession="first">
        <ProviderProbe />
      </CopilotProvider>,
    );
    await waitFor(() =>
      expect(snapshot.current?.sessions.activeSession.id).toBe(session.id),
    );
    act(() => snapshot.current?.composer.setDraft("Pending old request"));
    await waitFor(() => expect(snapshot.current?.composer.canSend).toBe(true));
    let pendingSend!: ReturnType<ProviderProbeSnapshot["composer"]["send"]>;
    act(() => {
      pendingSend = snapshot.current!.composer.send();
    });
    await waitFor(() => expect(startRun).toHaveBeenCalledTimes(1));

    view.rerender(
      <CopilotProvider transport={transport} initialSession="first" enabled={false}>
        <ProviderProbe />
      </CopilotProvider>,
    );
    let sendResult;
    await act(async () => {
      pendingRun.resolve({
        id: "old-run",
        sessionId: session.id,
        status: "queued",
      });
      sendResult = await pendingSend;
    });

    expect(sendResult).toMatchObject({ accepted: false });
    expect(subscribeRun).not.toHaveBeenCalled();
    expect(snapshot.current?.sessions.sessions).toEqual([]);
    expect(snapshot.current?.sessions.activeSession.status).toBe("empty");
    expect(snapshot.current?.state.run.status).toBe("ready");
    expect(snapshot.current?.composer.draft).toBe("");
  });

  it("ignores old bootstrap and model results after disabling", async () => {
    const transport = new MemoryCopilotTransport();
    const oldSession = await transport.createSession({ title: "Old account" });
    const pendingList = deferred<CopilotSessionSummary[]>();
    const listSessions = vi
      .spyOn(transport, "listSessions")
      .mockReturnValueOnce(pendingList.promise);
    const modelCatalog = new MemoryCopilotModelCatalog();
    const pendingModels = deferred<
      Awaited<ReturnType<typeof modelCatalog.list>>
    >();
    const listModels = vi
      .spyOn(modelCatalog, "list")
      .mockReturnValueOnce(pendingModels.promise);
    const { snapshot, ProviderProbe } = createProviderProbe();
    const view = render(
      <CopilotProvider
        transport={transport}
        modelCatalog={modelCatalog}
        initialSession="first"
      >
        <ProviderProbe />
      </CopilotProvider>,
    );
    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(listModels).toHaveBeenCalledTimes(1));

    view.rerender(
      <CopilotProvider
        transport={transport}
        modelCatalog={modelCatalog}
        initialSession="first"
        enabled={false}
      >
        <ProviderProbe />
      </CopilotProvider>,
    );
    await act(async () => {
      pendingList.resolve([
        {
          id: oldSession.id,
          title: oldSession.title,
          createdAt: oldSession.createdAt,
          updatedAt: oldSession.updatedAt,
        },
      ]);
      pendingModels.resolve([
        { id: "old-model", displayName: "Old model", isDefault: true },
      ]);
      await Promise.all([pendingList.promise, pendingModels.promise]);
    });

    expect(snapshot.current?.sessions.sessions).toEqual([]);
    expect(snapshot.current?.sessions.activeSession.status).toBe("empty");
    expect(snapshot.current?.models.models).toEqual([]);
    expect(snapshot.current?.models.selectedModelId).toBeNull();
  });

  it("ignores an old session load after disabling", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession({ title: "Old account" });
    const pendingSession = deferred<CopilotSession>();
    vi.spyOn(transport, "getSession").mockReturnValueOnce(
      pendingSession.promise,
    );
    const { snapshot, ProviderProbe } = createProviderProbe();
    const view = render(
      <CopilotProvider transport={transport} initialSession="none">
        <ProviderProbe />
      </CopilotProvider>,
    );
    await waitFor(() => expect(snapshot.current?.sessions.listStatus).toBe("ready"));
    let selection!: Promise<void>;
    act(() => {
      selection = snapshot.current!.sessions.select(session.id);
    });

    view.rerender(
      <CopilotProvider transport={transport} initialSession="none" enabled={false}>
        <ProviderProbe />
      </CopilotProvider>,
    );
    await act(async () => {
      pendingSession.resolve(session);
      await selection;
    });

    expect(snapshot.current?.sessions.sessions).toEqual([]);
    expect(snapshot.current?.sessions.activeSession.status).toBe("empty");
    expect(snapshot.current?.state.run.status).toBe("ready");
  });

  it("does not continue an old attachment send after disabling", async () => {
    const transport = new MemoryCopilotTransport();
    await transport.createSession({ title: "Old account" });
    const pendingUpload = deferred<CopilotAttachmentPart>();
    const uploadAttachment = vi
      .spyOn(transport, "uploadAttachment")
      .mockReturnValueOnce(pendingUpload.promise);
    const startRun = vi.spyOn(transport, "startRun");
    const { snapshot, ProviderProbe } = createProviderProbe();
    const view = render(
      <CopilotProvider transport={transport} initialSession="first">
        <ProviderProbe />
      </CopilotProvider>,
    );
    await waitFor(() =>
      expect(snapshot.current?.sessions.activeSession.status).toBe("ready"),
    );
    act(() => snapshot.current?.composer.setDraft("Old upload"));
    await act(() =>
      snapshot.current!.composer.addAttachments([
        new File(["old"], "old.txt", { type: "text/plain" }),
      ]),
    );
    let pendingSend!: ReturnType<ProviderProbeSnapshot["composer"]["send"]>;
    act(() => {
      pendingSend = snapshot.current!.composer.send();
    });
    await waitFor(() => expect(uploadAttachment).toHaveBeenCalledTimes(1));

    view.rerender(
      <CopilotProvider transport={transport} initialSession="first" enabled={false}>
        <ProviderProbe />
      </CopilotProvider>,
    );
    let sendResult;
    await act(async () => {
      pendingUpload.resolve({
        type: "attachment",
        id: "old-upload",
        name: "old.txt",
      });
      sendResult = await pendingSend;
    });

    expect(sendResult).toMatchObject({ accepted: false });
    expect(startRun).not.toHaveBeenCalled();
    expect(snapshot.current?.sessions.sessions).toEqual([]);
    expect(snapshot.current?.composer.attachments).toEqual([]);
  });

  it("isolates an enabled runtime when the transport identity changes", async () => {
    const oldTransport = new MemoryCopilotTransport();
    const oldSession = await oldTransport.createSession({ title: "Old account" });
    const newTransport = new MemoryCopilotTransport();
    const newSession = await newTransport.createSession({ title: "New account" });
    const newListed = await newTransport.listSessions();
    const pendingNewList = deferred<CopilotSessionSummary[]>();
    vi.spyOn(newTransport, "listSessions").mockReturnValueOnce(
      pendingNewList.promise,
    );
    const { snapshot, ProviderProbe } = createProviderProbe();
    const view = render(
      <CopilotProvider transport={oldTransport} initialSession="first">
        <ProviderProbe />
      </CopilotProvider>,
    );
    await waitFor(() =>
      expect(snapshot.current?.sessions.activeSession.id).toBe(oldSession.id),
    );

    view.rerender(
      <CopilotProvider transport={newTransport} initialSession="first">
        <ProviderProbe />
      </CopilotProvider>,
    );

    expect(snapshot.current?.sessions.sessions).toEqual([]);
    expect(snapshot.current?.sessions.activeSession.status).toBe("empty");
    await act(async () => {
      pendingNewList.resolve(newListed);
      await pendingNewList.promise;
    });
    await waitFor(() =>
      expect(snapshot.current?.sessions.activeSession.id).toBe(newSession.id),
    );
    expect(snapshot.current?.sessions.sessions.map((item) => item.title)).toEqual([
      "New account",
    ]);
  });

  it("does not expose disabled account data when the next bootstrap fails", async () => {
    const oldTransport = new MemoryCopilotTransport();
    const oldSession = await oldTransport.createSession({ title: "Old account" });
    const newTransport = new MemoryCopilotTransport();
    vi.spyOn(newTransport, "listSessions").mockRejectedValueOnce(
      new Error("new account offline"),
    );
    const { snapshot, ProviderProbe } = createProviderProbe();
    const view = render(
      <CopilotProvider transport={oldTransport} initialSession="first">
        <ProviderProbe />
      </CopilotProvider>,
    );
    await waitFor(() =>
      expect(snapshot.current?.sessions.activeSession.id).toBe(oldSession.id),
    );
    view.rerender(
      <CopilotProvider transport={oldTransport} initialSession="first" enabled={false}>
        <ProviderProbe />
      </CopilotProvider>,
    );
    view.rerender(
      <CopilotProvider transport={newTransport} initialSession="first">
        <ProviderProbe />
      </CopilotProvider>,
    );

    await waitFor(() => expect(snapshot.current?.sessions.listStatus).toBe("error"));
    expect(snapshot.current?.sessions.sessions).toEqual([]);
    expect(snapshot.current?.sessions.activeSession.status).toBe("empty");
    expect(snapshot.current?.state.run.status).toBe("ready");
  });

  it("clears an account model selection when disabled", async () => {
    const transport = new MemoryCopilotTransport();
    const storage = new MemoryCopilotStorage([
      ["copilot:last-model-id", "shared-model"],
    ]);
    const fallbackModels = [
      { id: "default-model", displayName: "Default", isDefault: true },
      { id: "shared-model", displayName: "Shared" },
    ];
    const modelCatalog = new MemoryCopilotModelCatalog(fallbackModels);
    const { snapshot, ProviderProbe } = createProviderProbe();
    const view = render(
      <CopilotProvider
        transport={transport}
        storage={storage}
        modelCatalog={modelCatalog}
        fallbackModels={fallbackModels}
      >
        <ProviderProbe />
      </CopilotProvider>,
    );
    await waitFor(() => expect(snapshot.current?.models.status).toBe("ready"));
    expect(snapshot.current?.models.selectedModelId).toBe("shared-model");

    view.rerender(
      <CopilotProvider
        transport={transport}
        storage={storage}
        modelCatalog={modelCatalog}
        fallbackModels={fallbackModels}
        enabled={false}
      >
        <ProviderProbe />
      </CopilotProvider>,
    );

    expect(storage.get("copilot:last-model-id")).toBeNull();
    expect(snapshot.current?.models.models).toEqual(fallbackModels);
    expect(snapshot.current?.models.selectedModelId).toBe("default-model");
  });

  it("does not carry a model selection across a live transport change", async () => {
    const oldTransport = new MemoryCopilotTransport();
    const newTransport = new MemoryCopilotTransport();
    const storage = new MemoryCopilotStorage([
      ["copilot:last-model-id", "shared-model"],
    ]);
    const fallbackModels = [
      { id: "default-model", displayName: "Default", isDefault: true },
      { id: "shared-model", displayName: "Shared" },
    ];
    const modelCatalog = new MemoryCopilotModelCatalog(fallbackModels);
    const { snapshot, ProviderProbe } = createProviderProbe();
    const view = render(
      <CopilotProvider
        transport={oldTransport}
        storage={storage}
        modelCatalog={modelCatalog}
        fallbackModels={fallbackModels}
      >
        <ProviderProbe />
      </CopilotProvider>,
    );
    await waitFor(() => expect(snapshot.current?.models.status).toBe("ready"));
    expect(snapshot.current?.models.selectedModelId).toBe("shared-model");

    view.rerender(
      <CopilotProvider
        transport={newTransport}
        storage={storage}
        modelCatalog={modelCatalog}
        fallbackModels={fallbackModels}
      >
        <ProviderProbe />
      </CopilotProvider>,
    );

    expect(storage.get("copilot:last-model-id")).toBeNull();
    expect(snapshot.current?.models.selectedModelId).toBe("default-model");
    await waitFor(() => expect(snapshot.current?.models.status).toBe("ready"));
    expect(snapshot.current?.models.selectedModelId).toBe("default-model");
  });

  it("does not expose a seeded account selection while initially disabled", () => {
    const transport = new MemoryCopilotTransport();
    const storage = new MemoryCopilotStorage([
      ["copilot:last-model-id", "shared-model"],
    ]);
    const fallbackModels = [
      { id: "default-model", displayName: "Default", isDefault: true },
      { id: "shared-model", displayName: "Shared" },
    ];
    const modelCatalog = new MemoryCopilotModelCatalog(fallbackModels);
    const listModels = vi.spyOn(modelCatalog, "list");
    const { result } = renderHook(() => useCopilotModels(), {
      wrapper: createWrapper({
        transport,
        storage,
        modelCatalog,
        fallbackModels,
        enabled: false,
      }),
    });

    expect(listModels).not.toHaveBeenCalled();
    expect(result.current.models).toEqual(fallbackModels);
    expect(result.current.selectedModelId).toBe("default-model");
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
    const location = new MemoryCopilotSessionLocation(existing.id);
    vi.spyOn(transport, "renameSession").mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, initialSession: "first", sessionLocation: location }),
    });
    await waitFor(() => expect(result.current.activeSession.id).toBe(existing.id));

    const mutation = await act(async () => result.current.rename(existing.id, "Changed"));

    expect(mutation).toMatchObject({ ok: false });
    expect(result.current.sessions[0]?.title).toBe("Existing");
    expect(result.current.activeSession.id).toBe(existing.id);
    expect(location.get()).toBe(existing.id);
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
    const location = new MemoryCopilotSessionLocation(existing.id);
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, initialSession: "first", sessionLocation: location }),
    });
    await waitFor(() => expect(result.current.activeSession.id).toBe(existing.id));
    vi.spyOn(transport, "deleteSession").mockRejectedValue(new Error("offline"));

    const mutation = await act(async () => result.current.remove(existing.id));

    expect(mutation).toMatchObject({ ok: false, activeSessionId: existing.id });
    expect(result.current.sessions.map((session) => session.id)).toEqual([
      existing.id,
    ]);
    expect(result.current.activeSession.id).toBe(existing.id);
    expect(location.get()).toBe(existing.id);
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

  it("exposes an initial session list failure", async () => {
    const transport = new MemoryCopilotTransport();
    vi.spyOn(transport, "listSessions").mockRejectedValueOnce(
      new Error("Session list offline"),
    );
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, initialSession: "first" }),
    });

    await waitFor(() => expect(result.current.listStatus).toBe("error"));
    expect(result.current.error).toMatchObject({
      operation: "load-sessions",
      message: "Session list offline",
    });
  });

  it("reruns first-or-create bootstrap after the initial list recovers", async () => {
    const transport = new MemoryCopilotTransport();
    vi.spyOn(transport, "listSessions")
      .mockRejectedValueOnce(new Error("Session list offline"))
      .mockResolvedValueOnce([]);
    const createSession = vi.spyOn(transport, "createSession");
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, initialSession: "first-or-create" }),
    });
    await waitFor(() => expect(result.current.listStatus).toBe("error"));

    await act(() => result.current.refresh());

    await waitFor(() => expect(result.current.activeSession.status).toBe("ready"));
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it("does not let refresh bootstrap overwrite a concurrent UI selection", async () => {
    const transport = new MemoryCopilotTransport();
    const first = await transport.createSession({ title: "First" });
    const second = await transport.createSession({ title: "Second" });
    const firstLoad = deferred<CopilotSession>();
    const originalGetSession = transport.getSession.bind(transport);
    const getSession = vi
      .spyOn(transport, "getSession")
      .mockImplementation((id) =>
        id === first.id ? firstLoad.promise : originalGetSession(id),
      );
    vi.spyOn(transport, "listSessions")
      .mockRejectedValueOnce(new Error("Session list offline"))
      .mockResolvedValueOnce([first, second]);
    const location = new MemoryCopilotSessionLocation(first.id);
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({
        transport,
        sessionLocation: location,
        initialSession: "first",
      }),
    });
    await waitFor(() => expect(result.current.listStatus).toBe("error"));

    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = result.current.refresh();
    });
    await waitFor(() =>
      expect(getSession).toHaveBeenCalledWith(first.id, expect.any(Object)),
    );
    await act(() => result.current.select(second.id));

    await act(async () => {
      firstLoad.resolve(first);
      await refreshPromise;
    });

    expect(result.current.activeSession.id).toBe(second.id);
    expect(location.get()).toBe(second.id);
  });

  it("ignores a stale refresh bootstrap rejection after UI selection", async () => {
    const transport = new MemoryCopilotTransport();
    const first = await transport.createSession({ title: "First" });
    const second = await transport.createSession({ title: "Second" });
    const firstLoad = deferred<CopilotSession>();
    const originalGetSession = transport.getSession.bind(transport);
    const getSession = vi
      .spyOn(transport, "getSession")
      .mockImplementation((id) =>
        id === first.id ? firstLoad.promise : originalGetSession(id),
      );
    vi.spyOn(transport, "listSessions")
      .mockRejectedValueOnce(new Error("Session list offline"))
      .mockResolvedValueOnce([first, second]);
    const location = new MemoryCopilotSessionLocation(first.id);
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({
        transport,
        sessionLocation: location,
        initialSession: "first",
      }),
    });
    await waitFor(() => expect(result.current.listStatus).toBe("error"));

    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = result.current.refresh();
    });
    await waitFor(() =>
      expect(getSession).toHaveBeenCalledWith(first.id, expect.any(Object)),
    );
    await act(() => result.current.select(second.id));

    await act(async () => {
      firstLoad.reject(new Error("Stale bootstrap offline"));
      await refreshPromise;
    });

    expect(result.current.activeSession.id).toBe(second.id);
    expect(result.current.listStatus).toBe("ready");
    expect(result.current.error).toBeNull();
    expect(location.get()).toBe(second.id);
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

  it("accepts a fresh list as authoritative for an inactive session run", async () => {
    const transport = new MemoryCopilotTransport();
    const first = await transport.createSession({ title: "First" });
    const second = await transport.createSession({ title: "Second" });
    const run = await transport.startRun({
      sessionId: first.id,
      text: "Background work",
    });
    transport.emit(run.id, {
      type: "run-status",
      runId: run.id,
      sessionId: first.id,
      sequence: 1,
      status: "running",
    });
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, initialSession: "first" }),
    });
    await waitFor(() =>
      expect(
        result.current.sessions.find((session) => session.id === first.id)
          ?.metadata?.activeRunId,
      ).toBe(run.id),
    );

    await act(async () => result.current.select(second.id));
    transport.emit(run.id, {
      type: "run-status",
      runId: run.id,
      sessionId: first.id,
      sequence: 2,
      status: "completed",
    });
    await act(async () => result.current.refresh());

    expect(
      result.current.sessions.find((session) => session.id === first.id)
        ?.metadata?.activeRunId,
    ).toBeUndefined();
    expect(
      result.current.sessions.find((session) => session.id === first.id)
        ?.metadata?.activeRunStatus,
    ).toBeUndefined();
  });

  it("does not let a list started before a local terminal event resurrect a run", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession({ title: "Running" });
    const run = await transport.startRun({ sessionId: session.id, text: "Work" });
    transport.emit(run.id, {
      type: "run-status",
      runId: run.id,
      sessionId: session.id,
      sequence: 1,
      status: "running",
    });
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, initialSession: "first" }),
    });
    await waitFor(() =>
      expect(result.current.sessions[0]?.metadata?.activeRunId).toBe(run.id),
    );
    const staleList = deferred<CopilotSessionSummary[]>();
    vi.spyOn(transport, "listSessions").mockReturnValueOnce(staleList.promise);

    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = result.current.refresh();
    });
    await waitFor(() => expect(result.current.listStatus).toBe("loading"));
    act(() => {
      transport.emit(run.id, {
        type: "run-status",
        runId: run.id,
        sessionId: session.id,
        sequence: 2,
        status: "completed",
      });
    });
    await act(async () => {
      staleList.resolve([
        {
          id: session.id,
          title: session.title,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          metadata: {
            activeRunId: run.id,
            activeRunStatus: "running",
          },
        },
      ]);
      await refreshPromise;
    });

    expect(result.current.sessions[0]?.metadata?.activeRunId).toBeUndefined();
    expect(result.current.sessions[0]?.metadata?.activeRunStatus).toBeUndefined();
  });

  it("retains a terminal run marker across an authoritative empty list", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession({ title: "Terminal marker" });
    const run = await transport.startRun({ sessionId: session.id, text: "Work" });
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, initialSession: "first" }),
    });
    await waitFor(() =>
      expect(result.current.sessions[0]?.metadata?.activeRunId).toBe(run.id),
    );
    act(() => {
      transport.emit(run.id, {
        type: "run-status",
        runId: run.id,
        sessionId: session.id,
        sequence: 1,
        status: "completed",
      });
    });

    await act(async () => result.current.refresh());
    vi.spyOn(transport, "listSessions").mockResolvedValueOnce([
      {
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        metadata: {
          activeRunId: run.id,
          activeRunStatus: "running",
        },
      },
    ]);
    await act(async () => result.current.refresh());

    expect(result.current.sessions[0]?.metadata?.activeRunId).toBeUndefined();
    expect(result.current.sessions[0]?.metadata?.activeRunStatus).toBeUndefined();
  });

  it("remembers the previous run when restore reports no active run", async () => {
    const transport = new MemoryCopilotTransport();
    const first = await transport.createSession({ title: "First" });
    const second = await transport.createSession({ title: "Second" });
    const run = await transport.startRun({ sessionId: first.id, text: "Work" });
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, initialSession: "first" }),
    });
    await waitFor(() =>
      expect(
        result.current.sessions.find((session) => session.id === first.id)
          ?.metadata?.activeRunId,
      ).toBe(run.id),
    );
    await act(async () => result.current.select(second.id));
    vi.spyOn(transport, "getActiveRun").mockResolvedValueOnce(null);
    await act(async () => result.current.select(first.id));
    vi.spyOn(transport, "listSessions").mockResolvedValueOnce([
      {
        id: first.id,
        title: first.title,
        createdAt: first.createdAt,
        updatedAt: first.updatedAt,
        metadata: {
          activeRunId: run.id,
          activeRunStatus: "running",
        },
      },
      second,
    ]);

    await act(async () => result.current.refresh());

    expect(
      result.current.sessions.find((session) => session.id === first.id)
        ?.metadata?.activeRunId,
    ).toBeUndefined();
    expect(
      result.current.sessions.find((session) => session.id === first.id)
        ?.metadata?.activeRunStatus,
    ).toBeUndefined();
  });

  it("accepts a new backend run after a previous local run became terminal", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession({ title: "Sequential runs" });
    const firstRun = await transport.startRun({
      sessionId: session.id,
      text: "First work",
    });
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({ transport, initialSession: "first" }),
    });
    await waitFor(() =>
      expect(result.current.sessions[0]?.metadata?.activeRunId).toBe(firstRun.id),
    );
    act(() => {
      transport.emit(firstRun.id, {
        type: "run-status",
        runId: firstRun.id,
        sessionId: session.id,
        sequence: 1,
        status: "completed",
      });
    });
    const nextRun = await transport.startRun({
      sessionId: session.id,
      text: "Second work",
    });
    vi.spyOn(transport, "listSessions").mockResolvedValueOnce([
      {
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        metadata: {
          activeRunId: nextRun.id,
          activeRunStatus: nextRun.status,
        },
      },
    ]);

    await act(async () => result.current.refresh());

    expect(result.current.sessions[0]?.metadata).toMatchObject({
      activeRunId: nextRun.id,
      activeRunStatus: nextRun.status,
    });

    await act(async () => result.current.select(session.id));
    vi.spyOn(transport, "listSessions").mockResolvedValueOnce([
      {
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        metadata: {
          activeRunId: firstRun.id,
          activeRunStatus: "running",
        },
      },
    ]);
    await act(async () => result.current.refresh());

    expect(result.current.sessions[0]?.metadata).toMatchObject({
      activeRunId: nextRun.id,
      activeRunStatus: nextRun.status,
    });
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

    const renameResult = await act(() => result.current.rename(first.id, "Renamed"));
    expect(renameResult).toEqual({ ok: true });
    expect(result.current.sessions.find((item) => item.id === first.id)?.title).toBe(
      "Renamed",
    );
    const removeResult = await act(() => result.current.remove(first.id));

    expect(removeResult).toEqual({ ok: true, activeSessionId: second.id });
    expect(result.current.sessions.map((item) => item.id)).toEqual([second.id]);
    await waitFor(() => expect(result.current.activeSession.id).toBe(second.id));
  });

  it("creates and selects a replacement after removing the last active session", async () => {
    const transport = new MemoryCopilotTransport();
    const existing = await transport.createSession({ title: "Only" });
    const location = new MemoryCopilotSessionLocation(existing.id);
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({
        transport,
        sessionLocation: location,
        initialSession: "first-or-create",
      }),
    });
    await waitFor(() => expect(result.current.activeSession.id).toBe(existing.id));

    const mutation = await act(() => result.current.remove(existing.id));

    expect(mutation.ok).toBe(true);
    expect(mutation.activeSessionId).not.toBeNull();
    expect(mutation.activeSessionId).not.toBe(existing.id);
    expect(result.current.sessions.map((session) => session.id)).toEqual([
      mutation.activeSessionId,
    ]);
    expect(result.current.activeSession.id).toBe(mutation.activeSessionId);
    expect(location.get()).toBe(mutation.activeSessionId);
  });

  it("reports replacement creation failure after the last session is deleted", async () => {
    const transport = new MemoryCopilotTransport();
    const existing = await transport.createSession({ title: "Only" });
    const location = new MemoryCopilotSessionLocation(existing.id);
    const { result } = renderHook(() => useCopilotSessions(), {
      wrapper: createWrapper({
        transport,
        sessionLocation: location,
        initialSession: "first-or-create",
      }),
    });
    await waitFor(() => expect(result.current.activeSession.id).toBe(existing.id));
    vi.spyOn(transport, "createSession").mockRejectedValueOnce(new Error("offline"));

    const mutation = await act(() => result.current.remove(existing.id));

    expect(mutation).toEqual({ ok: true, activeSessionId: null });
    expect(result.current.sessions).toEqual([]);
    expect(result.current.activeSession.status).toBe("empty");
    expect(location.get()).toBeNull();
    expect(result.current.error?.operation).toBe("create-session");
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

  it.each(["completed", "cancelled", "failed"] as const)(
    "reconciles the canonical session after a %s run",
    async (status) => {
      const transport = new MemoryCopilotTransport();
      const session = await transport.createSession({ title: "Local title" });
      let observer!: CopilotRunObserver;
      let closed = false;
      vi.spyOn(transport, "subscribeRun").mockImplementation(
        (_run, nextObserver) => {
          observer = nextObserver;
          return {
            get closed() {
              return closed;
            },
            close() {
              closed = true;
            },
          } satisfies CopilotSubscription;
        },
      );
      const { result } = renderHook(
        () => ({
          composer: useCopilotComposer(),
          sessions: useCopilotSessions(),
        }),
        {
          wrapper: createWrapper({
            transport,
            sessionLocation: new MemoryCopilotSessionLocation(session.id),
          }),
        },
      );
      await waitFor(() =>
        expect(result.current.sessions.activeSession.id).toBe(session.id),
      );
      act(() => result.current.composer.setDraft("Canonicalize me"));
      await waitFor(() => expect(result.current.composer.canSend).toBe(true));
      const sent = await act(() => result.current.composer.send());
      const freshSession: CopilotSession = {
        ...session,
        title: `Canonical ${status}`,
        updatedAt: new Date("2026-07-21T00:00:00.000Z"),
        messages: [
          {
            id: `canonical-${status}`,
            role: "assistant",
            createdAt: new Date("2026-07-21T00:00:00.000Z"),
            parts: [{ type: "text", text: `Server ${status}` }],
          },
        ],
      };

      act(() => {
        observer.next({
          type: "run-status",
          runId: sent.runId!,
          sessionId: sent.sessionId,
          sequence: 1,
          status,
        });
        observer.complete(freshSession);
      });

      expect(result.current.sessions.activeSession.data).toEqual(freshSession);
      expect(result.current.sessions.sessions[0]).toMatchObject({
        id: session.id,
        title: `Canonical ${status}`,
        updatedAt: freshSession.updatedAt,
      });
    },
  );

  it("ignores a canonical completion from a stale session subscription", async () => {
    const transport = new MemoryCopilotTransport();
    const first = await transport.createSession({ title: "First" });
    const second = await transport.createSession({ title: "Second" });
    let firstObserver!: CopilotRunObserver;
    vi.spyOn(transport, "subscribeRun").mockImplementation(
      (_run, observer) => {
        firstObserver = observer;
        let closed = false;
        return {
          get closed() {
            return closed;
          },
          close() {
            closed = true;
          },
        } satisfies CopilotSubscription;
      },
    );
    const { result } = renderHook(
      () => ({
        composer: useCopilotComposer(),
        sessions: useCopilotSessions(),
      }),
      { wrapper: createWrapper({ transport, initialSession: "first" }) },
    );
    await waitFor(() =>
      expect(result.current.sessions.activeSession.id).toBe(first.id),
    );
    act(() => result.current.composer.setDraft("First work"));
    await waitFor(() => expect(result.current.composer.canSend).toBe(true));
    const sent = await act(() => result.current.composer.send());
    await act(() => result.current.sessions.select(second.id));
    const staleSession: CopilotSession = {
      ...first,
      title: "Stale canonical title",
      messages: [],
    };

    act(() => {
      firstObserver.next({
        type: "run-status",
        runId: sent.runId!,
        sessionId: first.id,
        sequence: 1,
        status: "completed",
      });
      firstObserver.complete(staleSession);
    });

    expect(result.current.sessions.activeSession.id).toBe(second.id);
    expect(result.current.sessions.activeSession.data?.title).toBe("Second");
    expect(
      result.current.sessions.sessions.find((item) => item.id === first.id)
        ?.title,
    ).toBe("First");
  });
});

describe("CopilotProvider composer lifecycle", () => {
  it("does not let a delayed send replace the selected session subscription", async () => {
    const transport = new MemoryCopilotTransport();
    const first = await transport.createSession({ title: "First" });
    const second = await transport.createSession({ title: "Second" });
    await transport.startRun({ sessionId: second.id, text: "Second work" });
    const releaseFirstRun = deferred<void>();
    const originalStartRun = transport.startRun.bind(transport);
    const startRun = vi
      .spyOn(transport, "startRun")
      .mockImplementationOnce(async (input) => {
        await releaseFirstRun.promise;
        return originalStartRun(input);
      })
      .mockImplementation(originalStartRun);
    const subscribeRun = vi.spyOn(transport, "subscribeRun");
    const { result } = renderHook(
      () => ({
        composer: useCopilotComposer(),
        sessions: useCopilotSessions(),
      }),
      { wrapper: createWrapper({ transport, initialSession: "first" }) },
    );
    await waitFor(() =>
      expect(result.current.sessions.activeSession.id).toBe(first.id),
    );
    act(() => result.current.composer.setDraft("First work"));
    await waitFor(() => expect(result.current.composer.canSend).toBe(true));

    let pendingSend!: ReturnType<typeof result.current.composer.send>;
    act(() => {
      pendingSend = result.current.composer.send();
    });
    await waitFor(() => expect(startRun).toHaveBeenCalledTimes(1));
    await act(() => result.current.sessions.select(second.id));
    await waitFor(() => expect(subscribeRun).toHaveBeenCalledTimes(1));
    const secondSubscription = subscribeRun.mock.results[0].value;

    let sendResult;
    await act(async () => {
      releaseFirstRun.resolve();
      sendResult = await pendingSend;
    });

    expect(sendResult).toMatchObject({
      accepted: false,
      sessionId: first.id,
    });
    expect(result.current.sessions.activeSession.id).toBe(second.id);
    expect(subscribeRun).toHaveBeenCalledTimes(1);
    expect(secondSubscription.closed).toBe(false);
  });

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
    expect(result.current.isSending).toBe(true);
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
    expect(result.current.isSending).toBe(false);
  });

  it("preserves draft, attachments, and model changes made after send capture", async () => {
    const transport = new MemoryCopilotTransport();
    const session = await transport.createSession();
    const uploadResult = deferred<CopilotAttachmentPart>();
    vi.spyOn(transport, "uploadAttachment").mockReturnValue(uploadResult.promise);
    const { result } = renderHook(
      () => ({ composer: useCopilotComposer(), models: useCopilotModels() }),
      {
        wrapper: createWrapper({
          transport,
          sessionLocation: new MemoryCopilotSessionLocation(session.id),
          modelCatalog: new MemoryCopilotModelCatalog([
            { id: "fast", displayName: "Fast", isDefault: true },
            { id: "deep", displayName: "Deep" },
          ]),
        }),
      },
    );
    await waitFor(() => expect(result.current.models.selectedModelId).toBe("fast"));
    const capturedFile = new File(["captured"], "captured.csv");
    const laterFile = new File(["later"], "later.csv");
    act(() => result.current.composer.setDraft("captured draft"));
    await act(() => result.current.composer.addAttachments([capturedFile]));

    let pending!: ReturnType<typeof result.current.composer.send>;
    act(() => {
      pending = result.current.composer.send();
    });
    expect(result.current.composer.isSending).toBe(true);
    await act(async () => {
      result.current.composer.setDraft("later draft");
      await result.current.composer.addAttachments([laterFile]);
      result.current.models.select("deep");
    });

    await act(async () => {
      uploadResult.resolve({
        type: "attachment",
        id: "uploaded-captured",
        name: capturedFile.name,
      });
      await pending;
    });

    expect(result.current.composer.isSending).toBe(false);
    expect(result.current.composer.draft).toBe("later draft");
    expect(result.current.composer.attachments).toEqual([
      expect.objectContaining({ file: laterFile, status: "pending" }),
    ]);
    expect(result.current.models.selectedModelId).toBe("deep");
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
    expect(result.current.isSending).toBe(false);
    expect(result.current.attachments[0]).toMatchObject({ status: "error" });

    let retryResult;
    await act(async () => {
      retryResult = await result.current.send();
    });
    expect(retryResult).toMatchObject({ accepted: true });
    expect(uploadAttachment).toHaveBeenCalledTimes(2);
    expect(startRun).toHaveBeenCalledTimes(1);
    expect(result.current.attachments).toEqual([]);
    expect(result.current.isSending).toBe(false);
  });
});
