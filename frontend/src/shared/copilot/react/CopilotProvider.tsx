import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createCopilotRuntimeState,
  reduceCopilotEvent,
  selectActiveRun,
  selectActiveSession,
  type CopilotCreateSessionInput,
  type CopilotAttachmentPart,
  type CopilotError,
  type CopilotMessage,
  type CopilotModel,
  type CopilotModelCatalog,
  type CopilotModelStatus,
  type CopilotPendingAttachment,
  type CopilotRun,
  type CopilotRunState,
  type CopilotSendInput,
  type CopilotSendResult,
  type CopilotRuntimeState,
  type CopilotSessionLocation,
  type CopilotSessionSummary,
  type CopilotStorage,
  type CopilotSubscription,
  type CopilotTransport,
  type CopilotTranslations,
} from "@/core/copilot";
import { DefaultCopilotTranslations } from "../translations/defaultCopilotTranslations";
import {
  CopilotComposerContext,
  CopilotModelContext,
  CopilotRunCommandsContext,
  CopilotSessionCommandsContext,
  CopilotStateContext,
  type CopilotSessionListStatus,
} from "./copilotContexts";

const LAST_SESSION_KEY = "copilot:last-session-id";
const LAST_MODEL_KEY = "copilot:last-model-id";
const EMPTY_MODELS: readonly CopilotModel[] = [];
const defaultTranslations = new DefaultCopilotTranslations();
let optimisticSequence = 0;

const chooseModelId = (
  models: readonly CopilotModel[],
  storedId: string | null,
): string | null => {
  if (storedId && models.some((model) => model.id === storedId)) {
    return storedId;
  }
  return models.find((model) => model.isDefault)?.id ?? models[0]?.id ?? null;
};

export interface CopilotProviderProps {
  transport: CopilotTransport;
  sessionLocation?: CopilotSessionLocation;
  storage?: CopilotStorage;
  modelCatalog?: CopilotModelCatalog;
  fallbackModels?: readonly CopilotModel[];
  translations?: CopilotTranslations;
  initialSession?: "create" | "first" | "none";
  enabled?: boolean;
  children: ReactNode;
}

function toCopilotError(
  operation: CopilotError["operation"],
  cause: unknown,
): CopilotError {
  if (
    cause &&
    typeof cause === "object" &&
    "code" in cause &&
    "operation" in cause &&
    "recoverable" in cause
  ) {
    return cause as CopilotError;
  }
  return {
    code: "transport-error",
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
    recoverable: true,
    cause,
  };
}

function toRunState(run: CopilotRun): CopilotRunState {
  if (run.status === "queued") return { status: "submitted", run };
  if (run.status === "awaiting-answer" && run.questionRequest) {
    return {
      status: "awaiting-answer",
      run,
      request: run.questionRequest,
    };
  }
  return { status: "streaming", run };
}

function summaryFromSession(
  session: CopilotRuntimeState["sessions"][string],
): CopilotSessionSummary {
  const { messages: _messages, ...summary } = session;
  return summary;
}

export function CopilotProvider({
  transport,
  sessionLocation,
  storage,
  modelCatalog,
  fallbackModels = EMPTY_MODELS,
  translations = defaultTranslations,
  initialSession = "none",
  enabled = true,
  children,
}: CopilotProviderProps) {
  const [runtime, setRuntime] = useState(createCopilotRuntimeState);
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;
  const [sessions, setSessions] = useState<CopilotSessionSummary[]>([]);
  const [listStatus, setListStatus] =
    useState<CopilotSessionListStatus>("idle");
  const [activeError, setActiveError] = useState<CopilotError | null>(null);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<CopilotPendingAttachment[]>([]);
  const [models, setModels] = useState<readonly CopilotModel[]>(fallbackModels);
  const [modelStatus, setModelStatus] = useState<CopilotModelStatus>(
    modelCatalog ? "idle" : "unavailable",
  );
  const [modelError, setModelError] = useState<CopilotError | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(() =>
    chooseModelId(fallbackModels, storage?.get(LAST_MODEL_KEY) ?? null),
  );
  const selectedModelIdRef = useRef(selectedModelId);
  selectedModelIdRef.current = selectedModelId;
  const modelSelectionRevisionRef = useRef(0);
  const modelRequestRevisionRef = useRef(0);
  const modelRequestAbortRef = useRef<AbortController | null>(null);
  const revisionRef = useRef(0);
  const activeIdRef = useRef<string | null>(null);
  const sessionsRef = useRef<CopilotSessionSummary[]>([]);
  const subscriptionRef = useRef<CopilotSubscription | null>(null);
  const lastSendRef = useRef<(CopilotSendInput & { optimisticId?: string }) | null>(null);
  const locationWriteRef = useRef<string | null | undefined>(undefined);

  const commitModelSelection = useCallback(
    (id: string | null) => {
      selectedModelIdRef.current = id;
      setSelectedModelId(id);
      if (id) storage?.set(LAST_MODEL_KEY, id);
      else storage?.remove(LAST_MODEL_KEY);
    },
    [storage],
  );

  const selectModel = useCallback(
    (id: string | null) => {
      ++modelSelectionRevisionRef.current;
      commitModelSelection(id);
    },
    [commitModelSelection],
  );

  const invalidateModelRequest = useCallback(() => {
    modelRequestAbortRef.current?.abort();
    modelRequestAbortRef.current = null;
    ++modelRequestRevisionRef.current;
  }, []);

  const refreshModels = useCallback(async () => {
    invalidateModelRequest();
    const requestRevision = modelRequestRevisionRef.current;
    const selectionRevision = modelSelectionRevisionRef.current;
    if (!modelCatalog) {
      const selectedId = chooseModelId(
        fallbackModels,
        storage?.get(LAST_MODEL_KEY) ?? null,
      );
      setModels(fallbackModels);
      commitModelSelection(selectedId);
      setModelError(null);
      setModelStatus("unavailable");
      return;
    }

    const controller = new AbortController();
    modelRequestAbortRef.current = controller;
    setModelStatus("loading");
    setModelError(null);
    try {
      const loadedModels = await modelCatalog.list({ signal: controller.signal });
      if (
        controller.signal.aborted ||
        requestRevision !== modelRequestRevisionRef.current
      ) {
        return;
      }
      const explicitSelection = selectedModelIdRef.current;
      const selectedId =
        selectionRevision !== modelSelectionRevisionRef.current &&
        explicitSelection !== null &&
        loadedModels.some((model) => model.id === explicitSelection)
          ? explicitSelection
          : chooseModelId(
              loadedModels,
              storage?.get(LAST_MODEL_KEY) ?? null,
            );
      setModels(loadedModels);
      commitModelSelection(selectedId);
      setModelStatus("ready");
    } catch (cause) {
      if (
        controller.signal.aborted ||
        requestRevision !== modelRequestRevisionRef.current
      ) {
        return;
      }
      const error = toCopilotError("load-models", cause);
      const explicitSelection = selectedModelIdRef.current;
      const selectedId =
        selectionRevision !== modelSelectionRevisionRef.current &&
        explicitSelection !== null &&
        fallbackModels.some((model) => model.id === explicitSelection)
          ? explicitSelection
          : chooseModelId(
              fallbackModels,
              storage?.get(LAST_MODEL_KEY) ?? null,
            );
      setModels(fallbackModels);
      commitModelSelection(selectedId);
      setModelError({ ...error, operation: "load-models" });
      setModelStatus("error");
    } finally {
      if (modelRequestAbortRef.current === controller) {
        modelRequestAbortRef.current = null;
      }
    }
  }, [
    commitModelSelection,
    fallbackModels,
    invalidateModelRequest,
    modelCatalog,
    storage,
  ]);

  const setRunState = useCallback((sessionId: string, run: CopilotRunState) => {
    setRuntime((previous) => ({
      ...previous,
      runs: { ...previous.runs, [sessionId]: run },
    }));
  }, []);

  const subscribeToRun = useCallback(
    (run: CopilotRun) => {
      subscriptionRef.current?.close();
      const subscription = transport.subscribeRun(
        run,
        {
          next(event) {
            setRuntime((previous) => reduceCopilotEvent(previous, event));
          },
          error(error) {
            setRunState(run.sessionId, { status: "error", run, error });
          },
          complete() {
            setRunState(run.sessionId, { status: "ready", run: null });
          },
        },
        { fromSequence: run.lastSequence },
      );
      subscriptionRef.current = subscription;
    },
    [setRunState, transport],
  );

  const replaceSessions = useCallback((next: CopilotSessionSummary[]) => {
    sessionsRef.current = next;
    setSessions(next);
  }, []);

  const writeLocation = useCallback(
    (id: string | null) => {
      if (!sessionLocation) return;
      locationWriteRef.current = id;
      sessionLocation.set(id, { replace: true });
      locationWriteRef.current = undefined;
    },
    [sessionLocation],
  );

  const restoreRun = useCallback(
    async (sessionId: string, revision: number) => {
      subscriptionRef.current?.close();
      subscriptionRef.current = null;
      if (!transport.capabilities.resumableStreams || !transport.getActiveRun) {
        setRuntime((previous) => ({
          ...previous,
          runs: {
            ...previous.runs,
            [sessionId]: { status: "ready", run: null },
          },
        }));
        return;
      }
      try {
        const run = await transport.getActiveRun(sessionId);
        if (revision !== revisionRef.current || activeIdRef.current !== sessionId) return;
        if (!run) {
          setRuntime((previous) => ({
            ...previous,
            runs: {
              ...previous.runs,
              [sessionId]: { status: "ready", run: null },
            },
          }));
          return;
        }
        setRuntime((previous) => ({
          ...previous,
          runs: { ...previous.runs, [sessionId]: toRunState(run) },
        }));
        if (revision === revisionRef.current) subscribeToRun(run);
      } catch (error) {
        if (revision !== revisionRef.current) return;
        setRuntime((previous) => ({
          ...previous,
          runs: {
            ...previous.runs,
            [sessionId]: {
              status: "error",
              run: null,
              error: toCopilotError("subscribe-run", error),
            },
          },
        }));
      }
    },
    [subscribeToRun, transport],
  );

  const selectSession = useCallback(
    async (id: string, source: "ui" | "location" | "initial" = "ui") => {
      const revision = ++revisionRef.current;
      activeIdRef.current = id;
      subscriptionRef.current?.close();
      subscriptionRef.current = null;
      setActiveError(null);
      setRuntime((previous) => ({
        ...previous,
        activeSessionId: id,
        sessions: Object.fromEntries(
          Object.entries(previous.sessions).filter(([sessionId]) => sessionId !== id),
        ),
      }));
      if (source !== "location") writeLocation(id);
      try {
        const session = await transport.getSession(id);
        if (revision !== revisionRef.current) return;
        setRuntime((previous) => ({
          ...previous,
          activeSessionId: id,
          sessions: { ...previous.sessions, [id]: session },
        }));
        storage?.set(LAST_SESSION_KEY, id);
        await restoreRun(id, revision);
      } catch (error) {
        if (revision !== revisionRef.current) return;
        setActiveError(toCopilotError("load-session", error));
      }
    },
    [restoreRun, storage, transport, writeLocation],
  );

  const create = useCallback(
    async (input?: CopilotCreateSessionInput): Promise<string> => {
      const revision = ++revisionRef.current;
      subscriptionRef.current?.close();
      const session = await transport.createSession(input);
      if (revision !== revisionRef.current) return session.id;
      const summary = summaryFromSession(session);
      replaceSessions([
        summary,
        ...sessionsRef.current.filter((item) => item.id !== session.id),
      ]);
      activeIdRef.current = session.id;
      setActiveError(null);
      setRuntime((previous) => ({
        ...previous,
        activeSessionId: session.id,
        sessions: { ...previous.sessions, [session.id]: session },
        runs: {
          ...previous.runs,
          [session.id]: { status: "ready", run: null },
        },
      }));
      storage?.set(LAST_SESSION_KEY, session.id);
      writeLocation(session.id);
      return session.id;
    },
    [replaceSessions, storage, transport, writeLocation],
  );

  const refresh = useCallback(async () => {
    setListStatus("loading");
    try {
      replaceSessions(await transport.listSessions());
      setListStatus("ready");
    } catch {
      setListStatus("error");
    }
  }, [replaceSessions, transport]);

  const rename = useCallback(
    async (id: string, title: string) => {
      const summary = await transport.renameSession(id, title);
      replaceSessions(
        sessionsRef.current.map((item) => (item.id === id ? summary : item)),
      );
      setRuntime((previous) => {
        const session = previous.sessions[id];
        return session
          ? {
              ...previous,
              sessions: {
                ...previous.sessions,
                [id]: { ...session, title, updatedAt: summary.updatedAt },
              },
            }
          : previous;
      });
    },
    [replaceSessions, transport],
  );

  const remove = useCallback(
    async (id: string) => {
      await transport.deleteSession(id);
      const remaining = sessionsRef.current.filter((item) => item.id !== id);
      replaceSessions(remaining);
      setRuntime((previous) => {
        const nextSessions = { ...previous.sessions };
        const nextRuns = { ...previous.runs };
        delete nextSessions[id];
        delete nextRuns[id];
        return { ...previous, sessions: nextSessions, runs: nextRuns };
      });
      if (activeIdRef.current !== id) return;
      if (remaining[0]) await selectSession(remaining[0].id);
      else {
        ++revisionRef.current;
        activeIdRef.current = null;
        storage?.remove(LAST_SESSION_KEY);
        writeLocation(null);
        setRuntime((previous) => ({ ...previous, activeSessionId: null }));
      }
    },
    [replaceSessions, selectSession, storage, transport, writeLocation],
  );

  const send = useCallback(
    async (input: CopilotSendInput): Promise<CopilotSendResult> => {
      const sessionId = activeIdRef.current ?? "";
      const text = input.text.trim();
      const invalid = !sessionId || (!text && !input.attachments?.length);
      if (invalid) {
        return {
          accepted: false,
          sessionId,
          error: {
            code: "validation-error",
            operation: "start-run",
            recoverable: true,
          },
        };
      }

      const uploaded: CopilotAttachmentPart[] = [];
      for (const file of input.attachments ?? []) {
        if (!transport.capabilities.attachments || !transport.uploadAttachment) {
          const error: CopilotError = {
            code: "unsupported-capability",
            operation: "upload-attachment",
            recoverable: false,
          };
          return { accepted: false, sessionId, error };
        }
        setAttachments((items) =>
          items.map((item) =>
            item.file === file ? { ...item, status: "uploading", error: undefined } : item,
          ),
        );
        try {
          uploaded.push(await transport.uploadAttachment(sessionId, file));
          setAttachments((items) =>
            items.map((item) =>
              item.file === file ? { ...item, status: "ready", error: undefined } : item,
            ),
          );
        } catch (cause) {
          const error = toCopilotError("upload-attachment", cause);
          setAttachments((items) =>
            items.map((item) =>
              item.file === file ? { ...item, status: "error", error } : item,
            ),
          );
          lastSendRef.current = { ...input };
          return { accepted: false, sessionId, error };
        }
      }

      const optimisticId =
        (input as CopilotSendInput & { optimisticId?: string }).optimisticId ??
        `copilot-user-${++optimisticSequence}`;
      const optimisticMessage: CopilotMessage = {
        id: optimisticId,
        role: "user",
        createdAt: new Date(),
        parts: [
          ...(text ? [{ type: "text" as const, text }] : []),
          ...uploaded,
        ],
        metadata: { ...input.metadata, optimistic: true },
      };
      setRuntime((previous) => {
        const session = previous.sessions[sessionId];
        if (!session || session.messages.some((message) => message.id === optimisticId)) {
          return previous;
        }
        return {
          ...previous,
          sessions: {
            ...previous.sessions,
            [sessionId]: {
              ...session,
              messages: [...session.messages, optimisticMessage],
            },
          },
        };
      });
      lastSendRef.current = { ...input, text, optimisticId };

      try {
        const run = await transport.startRun({
          sessionId,
          text,
          attachments: uploaded,
          modelId: input.modelId,
          metadata: input.metadata,
        });
        const assistantId = `run-${run.id}-assistant`;
        setRuntime((previous) => {
          const session = previous.sessions[sessionId];
          if (!session) return previous;
          const assistant: CopilotMessage = {
            id: assistantId,
            role: "assistant",
            createdAt: new Date(),
            parts: [],
            metadata: { optimistic: true, runId: run.id },
          };
          return {
            ...previous,
            sessions: {
              ...previous.sessions,
              [sessionId]: {
                ...session,
                messages: session.messages.some((message) => message.id === assistantId)
                  ? session.messages
                  : [...session.messages, assistant],
              },
            },
            runs: {
              ...previous.runs,
              [sessionId]: { status: "submitted", run },
            },
          };
        });
        subscribeToRun(run);
        return { accepted: true, sessionId, runId: run.id };
      } catch (cause) {
        const error = toCopilotError("start-run", cause);
        setRunState(sessionId, { status: "error", run: null, error });
        return { accepted: false, sessionId, error };
      }
    },
    [setRunState, subscribeToRun, transport],
  );

  const stop = useCallback(async () => {
    const sessionId = activeIdRef.current;
    if (!sessionId) return;
    const state = runtimeRef.current.runs[sessionId];
    const activeRun = !state || state.status === "ready" ? null : state.run;
    setRunState(sessionId, { status: "ready", run: null });
    const captured = subscriptionRef.current;
    subscriptionRef.current = null;
    captured?.close();
    if (!activeRun || !transport.capabilities.cancellableRuns || !transport.cancelRun) return;
    try {
      await transport.cancelRun(activeRun.id);
      const session = await transport.getSession(sessionId);
      setRuntime((previous) => ({
        ...previous,
        sessions: { ...previous.sessions, [sessionId]: session },
      }));
    } catch (cause) {
      setRunState(sessionId, {
        status: "error",
        run: activeRun,
        error: toCopilotError("cancel-run", cause),
      });
    }
  }, [setRunState, transport]);

  const submitApproval = useCallback(
    async (decision: "approve" | "reject") => {
      const sessionId = activeIdRef.current;
      if (!sessionId) return;
      const awaiting = runtimeRef.current.runs[sessionId];
      if (awaiting?.status !== "awaiting-approval") return;
      if (!transport.capabilities.approvals || !transport.submitApproval) {
        throw Object.assign(new Error("Approval is not supported"), {
          code: "unsupported-capability",
          operation: "submit-approval",
          recoverable: false,
        } satisfies CopilotError);
      }
      await transport.submitApproval(awaiting.run.id, decision);
      setRunState(sessionId, {
        status: "streaming",
        run: { ...awaiting.run, status: "running" },
      });
    },
    [setRunState, transport],
  );

  const submitAnswer = useCallback(
    async (answer: string) => {
      const sessionId = activeIdRef.current;
      if (!sessionId) return;
      const awaiting = runtimeRef.current.runs[sessionId];
      if (awaiting?.status !== "awaiting-answer") return;
      if (!transport.capabilities.questions || !transport.submitAnswer) {
        throw Object.assign(new Error("Questions are not supported"), {
          code: "unsupported-capability",
          operation: "submit-answer",
          recoverable: false,
        } satisfies CopilotError);
      }
      const resumedRun = await transport.submitAnswer(awaiting.run.id, answer);
      setRunState(sessionId, {
        status: "streaming",
        run: resumedRun,
      });
      subscribeToRun(resumedRun);
    },
    [setRunState, subscribeToRun, transport],
  );

  const retry = useCallback(async () => {
    const input = lastSendRef.current;
    if (input) await send(input);
  }, [send]);

  const clearError = useCallback(() => {
    const sessionId = activeIdRef.current;
    if (sessionId) setRunState(sessionId, { status: "ready", run: null });
  }, [setRunState]);

  const addAttachments = useCallback(async (files: readonly File[]) => {
    setAttachments((items) => [
      ...items,
      ...files.map((file) => ({
        id: `copilot-attachment-${++optimisticSequence}`,
        file,
        status: "pending" as const,
      })),
    ]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((items) => items.filter((item) => item.id !== id));
  }, []);

  const resetComposer = useCallback(() => {
    setDraft("");
    setAttachments([]);
  }, []);

  useEffect(() => {
    void refreshModels();
    return invalidateModelRequest;
  }, [invalidateModelRequest, refreshModels]);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    setListStatus("loading");
    void transport
      .listSessions()
      .then(async (listed) => {
        if (disposed) return;
        replaceSessions(listed);
        setListStatus("ready");
        const validIds = new Set(listed.map((session) => session.id));
        const located = sessionLocation?.get() ?? null;
        const stored = storage?.get(LAST_SESSION_KEY) ?? null;
        let selected = located && validIds.has(located) ? located : null;
        if (located && !selected) writeLocation(null);
        if (!selected && stored && validIds.has(stored)) selected = stored;
        if (!selected && initialSession === "first") selected = listed[0]?.id ?? null;
        if (selected) await selectSession(selected, "initial");
        else if (initialSession === "create") await create();
      })
      .catch(() => {
        if (!disposed) setListStatus("error");
      });
    const unsubscribe = sessionLocation?.subscribe((id) => {
      if (locationWriteRef.current === id || id === activeIdRef.current) return;
      if (id) void selectSession(id, "location");
      else {
        ++revisionRef.current;
        activeIdRef.current = null;
        setRuntime((previous) => ({ ...previous, activeSessionId: null }));
      }
    });
    return () => {
      disposed = true;
      ++revisionRef.current;
      unsubscribe?.();
      subscriptionRef.current?.close();
      subscriptionRef.current = null;
    };
  }, [
    create,
    enabled,
    initialSession,
    replaceSessions,
    selectSession,
    sessionLocation,
    storage,
    transport,
    writeLocation,
  ]);

  const activeSession = selectActiveSession(runtime, activeError);
  const run = selectActiveRun(runtime);
  const stateValue = useMemo(
    () => ({
      transport,
      translations,
      capabilities: transport.capabilities,
      sessionLocation,
      sessions,
      listStatus,
      activeSession,
      run,
    }),
    [activeSession, listStatus, run, sessionLocation, sessions, translations, transport],
  );
  const commandsValue = useMemo(
    () => ({ create, select: selectSession, rename, remove, refresh }),
    [create, refresh, remove, rename, selectSession],
  );
  const runCommandsValue = useMemo(
    () => ({ send, stop, submitApproval, submitAnswer, retry, clearError }),
    [clearError, retry, send, stop, submitAnswer, submitApproval],
  );
  const canSend =
    activeSession.status === "ready" &&
    (run.status === "ready" || run.status === "error") &&
    (draft.trim().length > 0 || attachments.length > 0);
  const sendComposer = useCallback(async () => {
    const result = await send({
      text: draft,
      attachments: attachments.map((item) => item.file),
      modelId: selectedModelIdRef.current ?? undefined,
    });
    if (result.accepted) {
      setDraft("");
      setAttachments([]);
    }
    return result;
  }, [attachments, draft, send]);
  const composerValue = useMemo(
    () => ({
      draft,
      attachments,
      canSend,
      setDraft,
      addAttachments,
      removeAttachment,
      send: sendComposer,
      reset: resetComposer,
    }),
    [
      addAttachments,
      attachments,
      canSend,
      draft,
      removeAttachment,
      resetComposer,
      sendComposer,
    ],
  );
  const modelValue = useMemo(
    () => ({
      models,
      status: modelStatus,
      selectedModelId,
      error: modelError,
      select: selectModel,
      refresh: refreshModels,
    }),
    [
      modelError,
      models,
      modelStatus,
      refreshModels,
      selectModel,
      selectedModelId,
    ],
  );

  return (
    <CopilotStateContext.Provider value={stateValue}>
      <CopilotSessionCommandsContext.Provider value={commandsValue}>
        <CopilotRunCommandsContext.Provider value={runCommandsValue}>
          <CopilotModelContext.Provider value={modelValue}>
            <CopilotComposerContext.Provider value={composerValue}>
              {children}
            </CopilotComposerContext.Provider>
          </CopilotModelContext.Provider>
        </CopilotRunCommandsContext.Provider>
      </CopilotSessionCommandsContext.Provider>
    </CopilotStateContext.Provider>
  );
}
