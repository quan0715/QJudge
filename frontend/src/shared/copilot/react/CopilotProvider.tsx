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
import {
  resolveCopilotSessionBootstrap,
  type CopilotInitialSessionStrategy,
} from "./copilotSessionBootstrap";

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
  initialSession?: CopilotInitialSessionStrategy;
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

function toSessionError(
  operation:
    | "load-sessions"
    | "load-session"
    | "create-session"
    | "update-session",
  cause: unknown,
): CopilotError {
  return { ...toCopilotError(operation, cause), operation };
}

function toRunState(run: CopilotRun): CopilotRunState {
  if (run.status === "queued") return { status: "submitted", run };
  if (run.status === "awaiting-approval" && run.approvalRequest) {
    return {
      status: "awaiting-approval",
      run,
      request: run.approvalRequest,
    };
  }
  if (run.status === "awaiting-answer" && run.questionRequest) {
    return {
      status: "awaiting-answer",
      run,
      request: run.questionRequest,
    };
  }
  return { status: "streaming", run };
}

function retainLatestResumeSequence(
  resumedRun: CopilotRun,
  previousRun: CopilotRun,
): CopilotRun {
  if (resumedRun.id !== previousRun.id) return resumedRun;
  const lastSequence = Math.max(
    resumedRun.lastSequence ?? -1,
    previousRun.lastSequence ?? -1,
  );
  return lastSequence >= 0 ? { ...resumedRun, lastSequence } : resumedRun;
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
  const [sessionError, setSessionError] = useState<CopilotError | null>(null);
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
  const sessionListRequestRevisionRef = useRef(0);
  const sessionListRequestAbortRef = useRef<AbortController | null>(null);
  const revisionRef = useRef(0);
  const activeIdRef = useRef<string | null>(null);
  const sessionsRef = useRef<CopilotSessionSummary[]>([]);
  const subscriptionRef = useRef<CopilotSubscription | null>(null);
  const subscriptionTokenRef = useRef<object | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreRunRef = useRef<
    ((sessionId: string, revision: number) => Promise<void>) | null
  >(null);
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

  const invalidateSessionListRequest = useCallback(() => {
    sessionListRequestAbortRef.current?.abort();
    sessionListRequestAbortRef.current = null;
    ++sessionListRequestRevisionRef.current;
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

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current === null) return;
    clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }, []);

  const closeRunSubscription = useCallback(() => {
    clearReconnectTimer();
    subscriptionTokenRef.current = null;
    subscriptionRef.current?.close();
    subscriptionRef.current = null;
  }, [clearReconnectTimer]);

  const subscribeToRun = useCallback(
    (run: CopilotRun) => {
      closeRunSubscription();
      const revision = revisionRef.current;
      const token = {};
      subscriptionTokenRef.current = token;
      let latestObservedStatus = run.status;
      let capturedSubscription: CopilotSubscription | null = null;
      const subscription = transport.subscribeRun(
        run,
        {
          next(event) {
            if (
              subscriptionTokenRef.current !== token ||
              revision !== revisionRef.current ||
              activeIdRef.current !== run.sessionId
            ) {
              return;
            }
            if (event.type === "awaiting-approval") {
              latestObservedStatus = "awaiting-approval";
            } else if (event.type === "awaiting-answer") {
              latestObservedStatus = "awaiting-answer";
            } else if (event.type === "run-status") {
              latestObservedStatus = event.status;
            }
            setRuntime((previous) => reduceCopilotEvent(previous, event));
          },
          error(error) {
            if (
              subscriptionTokenRef.current !== token ||
              revision !== revisionRef.current ||
              activeIdRef.current !== run.sessionId
            ) {
              return;
            }
            capturedSubscription?.close();
            if (subscriptionRef.current === capturedSubscription) {
              subscriptionRef.current = null;
            }
            subscriptionTokenRef.current = null;
            if (
              latestObservedStatus === "awaiting-approval" ||
              latestObservedStatus === "awaiting-answer"
            ) {
              return;
            }
            if (!error.recoverable) {
              setRunState(run.sessionId, { status: "error", run, error });
              return;
            }
            clearReconnectTimer();
            reconnectTimerRef.current = setTimeout(() => {
              reconnectTimerRef.current = null;
              if (
                revision !== revisionRef.current ||
                activeIdRef.current !== run.sessionId
              ) {
                return;
              }
              void restoreRunRef.current?.(run.sessionId, revisionRef.current);
            }, 1_000);
          },
          complete() {
            if (
              subscriptionTokenRef.current !== token ||
              revision !== revisionRef.current ||
              activeIdRef.current !== run.sessionId
            ) {
              return;
            }
            subscriptionTokenRef.current = null;
            if (subscriptionRef.current === capturedSubscription) {
              subscriptionRef.current = null;
            }
            clearReconnectTimer();
            capturedSubscription?.close();
          },
        },
        { fromSequence: run.lastSequence },
      );
      capturedSubscription = subscription;
      if (subscriptionTokenRef.current === token) {
        subscriptionRef.current = subscription;
      } else {
        subscription.close();
      }
    },
    [clearReconnectTimer, closeRunSubscription, setRunState, transport],
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
      closeRunSubscription();
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
        const localSequence = runtimeRef.current.lastResumeSequenceByRun[run.id];
        const lastSequence = Math.max(
          run.lastSequence ?? -1,
          localSequence ?? -1,
        );
        const restoredRun =
          lastSequence >= 0 ? { ...run, lastSequence } : run;
        setRuntime((previous) => ({
          ...previous,
          runs: { ...previous.runs, [sessionId]: toRunState(restoredRun) },
        }));
        if (revision === revisionRef.current) subscribeToRun(restoredRun);
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
    [closeRunSubscription, subscribeToRun, transport],
  );
  restoreRunRef.current = restoreRun;

  const selectSession = useCallback(
    async (id: string, source: "ui" | "location" | "initial" = "ui") => {
      const revision = ++revisionRef.current;
      activeIdRef.current = id;
      closeRunSubscription();
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
    [closeRunSubscription, restoreRun, storage, transport, writeLocation],
  );

  const create = useCallback(
    async (input?: CopilotCreateSessionInput): Promise<string | null> => {
      const startedRevision = revisionRef.current;
      const startedListRequestRevision =
        sessionListRequestRevisionRef.current;
      try {
        const session = await transport.createSession(input);
        if (
          startedListRequestRevision === sessionListRequestRevisionRef.current
        ) {
          invalidateSessionListRequest();
          setListStatus("ready");
        }
        setSessionError(null);
        const summary = summaryFromSession(session);
        replaceSessions([
          summary,
          ...sessionsRef.current.filter((item) => item.id !== session.id),
        ]);
        if (startedRevision !== revisionRef.current) return session.id;
        ++revisionRef.current;
        closeRunSubscription();
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
      } catch (cause) {
        setSessionError(toSessionError("create-session", cause));
        return null;
      }
    },
    [
      invalidateSessionListRequest,
      closeRunSubscription,
      replaceSessions,
      storage,
      transport,
      writeLocation,
    ],
  );

  const refresh = useCallback(async () => {
    invalidateSessionListRequest();
    const requestRevision = sessionListRequestRevisionRef.current;
    const controller = new AbortController();
    sessionListRequestAbortRef.current = controller;
    setListStatus("loading");
    try {
      const listed = await transport.listSessions({ signal: controller.signal });
      if (
        controller.signal.aborted ||
        requestRevision !== sessionListRequestRevisionRef.current
      ) {
        return;
      }
      replaceSessions(listed);
      setSessionError(null);
      setListStatus("ready");
    } catch (cause) {
      if (
        controller.signal.aborted ||
        requestRevision !== sessionListRequestRevisionRef.current
      ) {
        return;
      }
      setSessionError(toSessionError("load-sessions", cause));
      setListStatus("error");
    } finally {
      if (sessionListRequestAbortRef.current === controller) {
        sessionListRequestAbortRef.current = null;
      }
    }
  }, [invalidateSessionListRequest, replaceSessions, transport]);

  const rename = useCallback(
    async (id: string, title: string) => {
      try {
        const summary = await transport.renameSession(id, title);
        invalidateSessionListRequest();
        setSessionError(null);
        setListStatus("ready");
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
      } catch (cause) {
        setSessionError(toSessionError("update-session", cause));
      }
    },
    [invalidateSessionListRequest, replaceSessions, transport],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await transport.deleteSession(id);
      } catch (cause) {
        setSessionError(toSessionError("update-session", cause));
        return;
      }
      invalidateSessionListRequest();
      setSessionError(null);
      setListStatus("ready");
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
        closeRunSubscription();
        activeIdRef.current = null;
        storage?.remove(LAST_SESSION_KEY);
        writeLocation(null);
        setRuntime((previous) => ({ ...previous, activeSessionId: null }));
      }
    },
    [
      invalidateSessionListRequest,
      closeRunSubscription,
      replaceSessions,
      selectSession,
      storage,
      transport,
      writeLocation,
    ],
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
    closeRunSubscription();
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
  }, [closeRunSubscription, setRunState, transport]);

  const submitApproval = useCallback(
    async (decision: "approve" | "reject") => {
      const sessionId = activeIdRef.current;
      if (!sessionId) return;
      const awaiting = runtimeRef.current.runs[sessionId];
      if (awaiting?.status !== "awaiting-approval") return;
      const revision = revisionRef.current;
      try {
        if (!transport.capabilities.approvals || !transport.submitApproval) {
          throw Object.assign(new Error("Approval is not supported"), {
            code: "unsupported-capability",
            operation: "submit-approval",
            recoverable: false,
          } satisfies CopilotError);
        }
        const resumedRun = retainLatestResumeSequence(
          await transport.submitApproval(awaiting.run.id, decision),
          awaiting.run,
        );
        if (
          revision !== revisionRef.current ||
          activeIdRef.current !== sessionId
        ) {
          return;
        }
        setRunState(sessionId, { status: "streaming", run: resumedRun });
        subscribeToRun(resumedRun);
      } catch (cause) {
        if (
          revision !== revisionRef.current ||
          activeIdRef.current !== sessionId
        ) {
          return;
        }
        setRunState(sessionId, {
          ...awaiting,
          interactionError: toCopilotError("submit-approval", cause),
        });
      }
    },
    [setRunState, subscribeToRun, transport],
  );

  const submitAnswer = useCallback(
    async (answer: string) => {
      const sessionId = activeIdRef.current;
      if (!sessionId) return;
      const awaiting = runtimeRef.current.runs[sessionId];
      if (awaiting?.status !== "awaiting-answer") return;
      const revision = revisionRef.current;
      try {
        if (!transport.capabilities.questions || !transport.submitAnswer) {
          throw Object.assign(new Error("Questions are not supported"), {
            code: "unsupported-capability",
            operation: "submit-answer",
            recoverable: false,
          } satisfies CopilotError);
        }
        const resumedRun = retainLatestResumeSequence(
          await transport.submitAnswer(awaiting.run.id, answer),
          awaiting.run,
        );
        if (
          revision !== revisionRef.current ||
          activeIdRef.current !== sessionId
        ) {
          return;
        }
        setRunState(sessionId, { status: "streaming", run: resumedRun });
        subscribeToRun(resumedRun);
      } catch (cause) {
        if (
          revision !== revisionRef.current ||
          activeIdRef.current !== sessionId
        ) {
          return;
        }
        setRunState(sessionId, {
          ...awaiting,
          interactionError: toCopilotError("submit-answer", cause),
        });
      }
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

  const clearSessionError = useCallback(() => {
    setSessionError(null);
  }, []);

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
    const runRevision = revisionRef;
    let disposed = false;
    let listedLoaded = false;
    const bootstrapRevision = ++revisionRef.current;
    invalidateSessionListRequest();
    const listRequestRevision = sessionListRequestRevisionRef.current;
    const controller = new AbortController();
    sessionListRequestAbortRef.current = controller;
    const isListRequestCurrent = () =>
      !disposed &&
      !controller.signal.aborted &&
      listRequestRevision === sessionListRequestRevisionRef.current;
    const isBootstrapSelectionCurrent = () =>
      isListRequestCurrent() && bootstrapRevision === revisionRef.current;
    const invalidateBootstrapRequest = () => {
      controller.abort();
      if (sessionListRequestAbortRef.current === controller) {
        sessionListRequestAbortRef.current = null;
        ++sessionListRequestRevisionRef.current;
      }
    };
    setListStatus("loading");
    void (async () => {
      try {
        const listed = await transport.listSessions({
          signal: controller.signal,
        });
        if (!isListRequestCurrent()) return;
        listedLoaded = true;
        replaceSessions(listed);
        setListStatus("ready");
        if (!isBootstrapSelectionCurrent()) return;
        const located = sessionLocation?.get() ?? null;
        const stored = storage?.get(LAST_SESSION_KEY) ?? null;
        let bootstrap;
        try {
          bootstrap = await resolveCopilotSessionBootstrap({
            listed,
            locatedId: located,
            storedId: stored,
            strategy: initialSession,
            load: (id) => transport.getSession(id, { signal: controller.signal }),
          });
        } catch (cause) {
          if (!isBootstrapSelectionCurrent()) return;
          ++revisionRef.current;
          activeIdRef.current = located;
          closeRunSubscription();
          setRuntime((previous) => ({
            ...previous,
            activeSessionId: located,
          }));
          setActiveError(toSessionError("load-session", cause));
          setListStatus("ready");
          return;
        }
        if (!isBootstrapSelectionCurrent()) return;
        replaceSessions(bootstrap.sessions);
        setListStatus("ready");
        if (bootstrap.clearLocation) writeLocation(null);
        if (bootstrap.selectedSession) {
          const session = bootstrap.selectedSession;
          const revision = ++revisionRef.current;
          activeIdRef.current = session.id;
          closeRunSubscription();
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
          await restoreRun(session.id, revision);
        } else if (bootstrap.selectedId) {
          await selectSession(bootstrap.selectedId, "initial");
        } else if (bootstrap.create) {
          await create();
        }
      } catch {
        if (isListRequestCurrent()) setListStatus("error");
      } finally {
        if (sessionListRequestAbortRef.current === controller) {
          sessionListRequestAbortRef.current = null;
        }
      }
    })();
    const unsubscribe = sessionLocation?.subscribe((id) => {
      if (locationWriteRef.current === id || id === activeIdRef.current) return;
      invalidateBootstrapRequest();
      if (listedLoaded) setListStatus("ready");
      else void refresh();
      if (id) void selectSession(id, "location");
      else {
        ++revisionRef.current;
        closeRunSubscription();
        activeIdRef.current = null;
        setRuntime((previous) => ({ ...previous, activeSessionId: null }));
      }
    });
    return () => {
      disposed = true;
      controller.abort();
      invalidateSessionListRequest();
      ++runRevision.current;
      unsubscribe?.();
      closeRunSubscription();
    };
  }, [
    create,
    closeRunSubscription,
    enabled,
    initialSession,
    invalidateSessionListRequest,
    replaceSessions,
    refresh,
    restoreRun,
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
      sessionError,
      activeSession,
      run,
    }),
    [
      activeSession,
      listStatus,
      run,
      sessionError,
      sessionLocation,
      sessions,
      translations,
      transport,
    ],
  );
  const commandsValue = useMemo(
    () => ({
      create,
      select: selectSession,
      rename,
      remove,
      refresh,
      clearError: clearSessionError,
    }),
    [clearSessionError, create, refresh, remove, rename, selectSession],
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
