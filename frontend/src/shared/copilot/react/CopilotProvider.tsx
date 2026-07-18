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
  CopilotRunCommandsContext,
  CopilotSessionCommandsContext,
  CopilotStateContext,
  type CopilotSessionListStatus,
} from "./copilotContexts";

const LAST_SESSION_KEY = "copilot:last-session-id";
const defaultTranslations = new DefaultCopilotTranslations();
let optimisticSequence = 0;

export interface CopilotProviderProps {
  transport: CopilotTransport;
  sessionLocation?: CopilotSessionLocation;
  storage?: CopilotStorage;
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
  return run.status === "queued"
    ? { status: "submitted", run }
    : { status: "streaming", run };
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
  const [selectedModelId, setSelectedModel] = useState<string | null>(null);
  const revisionRef = useRef(0);
  const activeIdRef = useRef<string | null>(null);
  const sessionsRef = useRef<CopilotSessionSummary[]>([]);
  const subscriptionRef = useRef<CopilotSubscription | null>(null);
  const lastSendRef = useRef<(CopilotSendInput & { optimisticId?: string }) | null>(null);
  const locationWriteRef = useRef<string | null | undefined>(undefined);

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
      await transport.submitAnswer(awaiting.run.id, answer);
      setRunState(sessionId, {
        status: "streaming",
        run: { ...awaiting.run, status: "running" },
      });
    },
    [setRunState, transport],
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
    setSelectedModel(null);
  }, []);

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
      sessions,
      listStatus,
      activeSession,
      run,
    }),
    [activeSession, listStatus, run, sessions, translations, transport],
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
      modelId: selectedModelId ?? undefined,
    });
    if (result.accepted) {
      setDraft("");
      setAttachments([]);
    }
    return result;
  }, [attachments, draft, selectedModelId, send]);
  const composerValue = useMemo(
    () => ({
      draft,
      attachments,
      selectedModelId,
      canSend,
      setDraft,
      setSelectedModel,
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
      selectedModelId,
      sendComposer,
    ],
  );

  return (
    <CopilotStateContext.Provider value={stateValue}>
      <CopilotSessionCommandsContext.Provider value={commandsValue}>
        <CopilotRunCommandsContext.Provider value={runCommandsValue}>
          <CopilotComposerContext.Provider value={composerValue}>
            {children}
          </CopilotComposerContext.Provider>
        </CopilotRunCommandsContext.Provider>
      </CopilotSessionCommandsContext.Provider>
    </CopilotStateContext.Provider>
  );
}
