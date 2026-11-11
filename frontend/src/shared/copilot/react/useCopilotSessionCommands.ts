import { useCallback, useEffect, useRef } from "react";
import type {
  CopilotCreateSessionInput,
  CopilotRemoveSessionResult,
  CopilotRenameSessionResult,
  CopilotSessionLocation,
  CopilotStorage,
  CopilotTransport,
} from "@/core/copilot";
import {
  LAST_SESSION_KEY,
  ownershipChangedError,
  preserveActiveRunMetadata,
  summaryFromSession,
  toCopilotError,
  toSessionError,
  type CreateSessionOutcome,
} from "./copilotRuntimeHelpers";
import {
  resolveCopilotSessionBootstrap,
  type CopilotInitialSessionStrategy,
} from "./copilotSessionBootstrap";
import type { useCopilotRunSubscription } from "./useCopilotRunSubscription";
import type { CopilotRuntimeStore } from "./useCopilotRuntimeStore";

interface CopilotSessionCommandsInput {
  enabled: boolean;
  transport: CopilotTransport;
  sessionLocation: CopilotSessionLocation | undefined;
  storage: CopilotStorage | undefined;
  initialSession: CopilotInitialSessionStrategy;
  subscription: ReturnType<typeof useCopilotRunSubscription>;
}

/** Session list, selection and lifecycle commands, plus the initial bootstrap. */
export function useCopilotSessionCommands(
  store: CopilotRuntimeStore,
  {
    enabled,
    transport,
    sessionLocation,
    storage,
    initialSession,
    subscription,
  }: CopilotSessionCommandsInput,
) {
  const {
    setRuntime,
    sessionsRef,
    setListStatus,
    setActiveError,
    setSessionError,
    setDraft,
    setAttachments,
    enabledRef,
    ownershipEpochRef,
    revisionRef,
    activeIdRef,
    newSessionIntentRef,
    summaryRunBySessionRef,
    summaryTerminalRunIdBySessionRef,
    summaryRunRevisionBySessionRef,
    reconnectTimerRef,
    lastSendRef,
    lazyCreateInFlightRef,
  } = store;
  const {
    replaceSessions,
    clearReconnectTimer,
    closeRunSubscription,
    restoreRun,
  } = subscription;
  const sessionListRequestRevisionRef = useRef(0);
  const sessionListRequestAbortRef = useRef<AbortController | null>(null);
  const locationWriteRef = useRef<string | null | undefined>(undefined);

  const invalidateSessionListRequest = useCallback(() => {
    sessionListRequestAbortRef.current?.abort();
    sessionListRequestAbortRef.current = null;
    ++sessionListRequestRevisionRef.current;
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

  const selectSession = useCallback(
    async (id: string, source: "ui" | "location" | "initial" = "ui") => {
      if (!enabledRef.current) return;
      newSessionIntentRef.current = false;
      const ownershipEpoch = ownershipEpochRef.current;
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
        if (
          !enabledRef.current ||
          ownershipEpoch !== ownershipEpochRef.current ||
          revision !== revisionRef.current
        ) {
          return;
        }
        setRuntime((previous) => ({
          ...previous,
          activeSessionId: id,
          sessions: { ...previous.sessions, [id]: session },
        }));
        storage?.set(LAST_SESSION_KEY, id);
        await restoreRun(id, revision, true);
      } catch (error) {
        if (
          !enabledRef.current ||
          ownershipEpoch !== ownershipEpochRef.current ||
          revision !== revisionRef.current
        ) {
          return;
        }
        const loadError = toCopilotError("load-session", error);
        setActiveError(loadError);
        if (loadError.recoverable) {
          clearReconnectTimer();
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            if (!enabledRef.current || ownershipEpoch !== ownershipEpochRef.current
              || revision !== revisionRef.current || activeIdRef.current !== id) return;
            void selectSession(id, source);
          }, Math.max(1_000, loadError.retryAfterMs ?? 0));
        }
      }
    },
    [
      activeIdRef,
      clearReconnectTimer,
      closeRunSubscription,
      enabledRef,
      newSessionIntentRef,
      ownershipEpochRef,
      reconnectTimerRef,
      restoreRun,
      revisionRef,
      setActiveError,
      setRuntime,
      storage,
      transport,
      writeLocation,
    ],
  );

  const startNew = useCallback(() => {
    if (!enabledRef.current) return;
    newSessionIntentRef.current = true;
    ++revisionRef.current;
    closeRunSubscription();
    activeIdRef.current = null;
    lastSendRef.current = null;
    setActiveError(null);
    setSessionError(null);
    setDraft("");
    setAttachments([]);
    storage?.remove(LAST_SESSION_KEY);
    writeLocation(null);
    setRuntime((previous) => ({
      ...previous,
      activeSessionId: null,
    }));
  }, [
    activeIdRef,
    closeRunSubscription,
    enabledRef,
    lastSendRef,
    newSessionIntentRef,
    revisionRef,
    setActiveError,
    setAttachments,
    setDraft,
    setRuntime,
    setSessionError,
    storage,
    writeLocation,
  ]);

  const createAndActivate = useCallback(
    async (input?: CopilotCreateSessionInput): Promise<CreateSessionOutcome> => {
      if (!enabledRef.current) {
        return {
          ok: false,
          error: ownershipChangedError("create-session"),
        };
      }
      const ownershipEpoch = ownershipEpochRef.current;
      const startedRevision = revisionRef.current;
      const startedListRequestRevision =
        sessionListRequestRevisionRef.current;
      try {
        const session = await transport.createSession(input);
        if (
          !enabledRef.current ||
          ownershipEpoch !== ownershipEpochRef.current
        ) {
          return {
            ok: false,
            error: ownershipChangedError("create-session"),
          };
        }
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
        if (startedRevision !== revisionRef.current) {
          return { ok: true, sessionId: session.id, activated: false };
        }
        ++revisionRef.current;
        newSessionIntentRef.current = false;
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
        return { ok: true, sessionId: session.id, activated: true };
      } catch (cause) {
        if (
          !enabledRef.current ||
          ownershipEpoch !== ownershipEpochRef.current
        ) {
          return {
            ok: false,
            error: ownershipChangedError("create-session"),
          };
        }
        const error = toSessionError("create-session", cause);
        setSessionError(error);
        return { ok: false, error };
      }
    },
    [
      activeIdRef,
      closeRunSubscription,
      enabledRef,
      invalidateSessionListRequest,
      newSessionIntentRef,
      ownershipEpochRef,
      replaceSessions,
      revisionRef,
      sessionsRef,
      setActiveError,
      setListStatus,
      setRuntime,
      setSessionError,
      storage,
      transport,
      writeLocation,
    ],
  );

  const create = useCallback(
    async (input?: CopilotCreateSessionInput): Promise<string | null> => {
      const outcome = await createAndActivate(input);
      return outcome.ok ? outcome.sessionId : null;
    },
    [createAndActivate],
  );

  const ensureSessionForSend = useCallback(async (): Promise<CreateSessionOutcome> => {
    const existingId = activeIdRef.current;
    if (existingId) {
      return { ok: true, sessionId: existingId, activated: true };
    }
    if (lazyCreateInFlightRef.current) {
      return lazyCreateInFlightRef.current;
    }
    const pending = createAndActivate();
    lazyCreateInFlightRef.current = pending;
    const clear = () => {
      if (lazyCreateInFlightRef.current === pending) {
        lazyCreateInFlightRef.current = null;
      }
    };
    void pending.then(clear, clear);
    return pending;
  }, [
    activeIdRef,
    createAndActivate,
    lazyCreateInFlightRef,
  ]);

  const refresh = useCallback(async () => {
    if (!enabledRef.current) return;
    const ownershipEpoch = ownershipEpochRef.current;
    invalidateSessionListRequest();
    const requestRevision = sessionListRequestRevisionRef.current;
    const runRevisionSnapshot = {
      ...summaryRunRevisionBySessionRef.current,
    };
    const controller = new AbortController();
    sessionListRequestAbortRef.current = controller;
    setListStatus("loading");
    try {
      const listed = await transport.listSessions({ signal: controller.signal });
      if (
        !enabledRef.current ||
        ownershipEpoch !== ownershipEpochRef.current ||
        controller.signal.aborted ||
        requestRevision !== sessionListRequestRevisionRef.current
      ) {
        return;
      }
      replaceSessions(listed, runRevisionSnapshot);
      setSessionError(null);
      setListStatus("ready");
      if (activeIdRef.current === null && !newSessionIntentRef.current) {
        const bootstrapRevision = revisionRef.current;
        const bootstrapActiveId = activeIdRef.current;
        const isBootstrapCurrent = () =>
          enabledRef.current &&
          ownershipEpoch === ownershipEpochRef.current &&
          !controller.signal.aborted &&
          requestRevision === sessionListRequestRevisionRef.current &&
          bootstrapRevision === revisionRef.current &&
          activeIdRef.current === bootstrapActiveId;
        let bootstrap;
        try {
          bootstrap = await resolveCopilotSessionBootstrap({
            listed,
            locatedId: sessionLocation?.get() ?? null,
            storedId: storage?.get(LAST_SESSION_KEY) ?? null,
            strategy: initialSession,
            load: (id) =>
              transport.getSession(id, { signal: controller.signal }),
          });
        } catch (cause) {
          if (!isBootstrapCurrent()) return;
          throw cause;
        }
        if (!isBootstrapCurrent()) return;
        replaceSessions(bootstrap.sessions, runRevisionSnapshot);
        if (bootstrap.clearLocation) writeLocation(null);
        if (bootstrap.selectedId) {
          await selectSession(bootstrap.selectedId, "initial");
        } else if (bootstrap.create) {
          await create();
        }
      }
    } catch (cause) {
      if (
        !enabledRef.current ||
        ownershipEpoch !== ownershipEpochRef.current ||
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
  }, [
    activeIdRef,
    create,
    enabledRef,
    initialSession,
    invalidateSessionListRequest,
    newSessionIntentRef,
    ownershipEpochRef,
    replaceSessions,
    revisionRef,
    selectSession,
    sessionLocation,
    setListStatus,
    setSessionError,
    storage,
    summaryRunRevisionBySessionRef,
    transport,
    writeLocation,
  ]);

  const rename = useCallback(
    async (
      id: string,
      title: string,
    ): Promise<CopilotRenameSessionResult> => {
      if (!enabledRef.current) {
        return { ok: false, error: ownershipChangedError("update-session") };
      }
      const ownershipEpoch = ownershipEpochRef.current;
      try {
        const summary = await transport.renameSession(id, title);
        if (
          !enabledRef.current ||
          ownershipEpoch !== ownershipEpochRef.current
        ) {
          return { ok: false, error: ownershipChangedError("update-session") };
        }
        invalidateSessionListRequest();
        setSessionError(null);
        setListStatus("ready");
        const previousSummary = sessionsRef.current.find(
          (item) => item.id === id,
        );
        const nextSummary = preserveActiveRunMetadata(summary, previousSummary);
        replaceSessions(
          sessionsRef.current.map((item) =>
            item.id === id ? nextSummary : item,
          ),
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
        return { ok: true };
      } catch (cause) {
        if (
          !enabledRef.current ||
          ownershipEpoch !== ownershipEpochRef.current
        ) {
          return { ok: false, error: ownershipChangedError("update-session") };
        }
        const error = toSessionError("update-session", cause);
        setSessionError(error);
        return { ok: false, error };
      }
    },
    [
      enabledRef,
      invalidateSessionListRequest,
      ownershipEpochRef,
      replaceSessions,
      sessionsRef,
      setListStatus,
      setRuntime,
      setSessionError,
      transport,
    ],
  );

  const remove = useCallback(
    async (id: string): Promise<CopilotRemoveSessionResult> => {
      if (!enabledRef.current) {
        return {
          ok: false,
          activeSessionId: null,
          error: ownershipChangedError("update-session"),
        };
      }
      const ownershipEpoch = ownershipEpochRef.current;
      try {
        await transport.deleteSession(id);
        if (
          !enabledRef.current ||
          ownershipEpoch !== ownershipEpochRef.current
        ) {
          return {
            ok: false,
            activeSessionId: null,
            error: ownershipChangedError("update-session"),
          };
        }
      } catch (cause) {
        if (
          !enabledRef.current ||
          ownershipEpoch !== ownershipEpochRef.current
        ) {
          return {
            ok: false,
            activeSessionId: null,
            error: ownershipChangedError("update-session"),
          };
        }
        const error = toSessionError("update-session", cause);
        setSessionError(error);
        return {
          ok: false,
          activeSessionId: activeIdRef.current,
          error,
        };
      }
      invalidateSessionListRequest();
      setSessionError(null);
      setListStatus("ready");
      const remaining = sessionsRef.current.filter((item) => item.id !== id);
      delete summaryRunBySessionRef.current[id];
      delete summaryTerminalRunIdBySessionRef.current[id];
      delete summaryRunRevisionBySessionRef.current[id];
      replaceSessions(remaining);
      setRuntime((previous) => {
        const nextSessions = { ...previous.sessions };
        const nextRuns = { ...previous.runs };
        delete nextSessions[id];
        delete nextRuns[id];
        return { ...previous, sessions: nextSessions, runs: nextRuns };
      });
      if (activeIdRef.current !== id) {
        return { ok: true, activeSessionId: activeIdRef.current };
      }
      if (remaining[0]) {
        await selectSession(remaining[0].id);
        return { ok: true, activeSessionId: remaining[0].id };
      }

      ++revisionRef.current;
      closeRunSubscription();
      activeIdRef.current = null;
      storage?.remove(LAST_SESSION_KEY);
      writeLocation(null);
      setRuntime((previous) => ({ ...previous, activeSessionId: null }));

      if (initialSession === "first-or-create") {
        const replacementId = await create();
        return { ok: true, activeSessionId: replacementId };
      }
      return { ok: true, activeSessionId: null };
    },
    [
      enabledRef,
      ownershipEpochRef,
      invalidateSessionListRequest,
      setSessionError,
      setListStatus,
      sessionsRef,
      summaryRunBySessionRef,
      summaryTerminalRunIdBySessionRef,
      summaryRunRevisionBySessionRef,
      replaceSessions,
      setRuntime,
      activeIdRef,
      revisionRef,
      closeRunSubscription,
      storage,
      writeLocation,
      initialSession,
      transport,
      selectSession,
      create,
    ],
  );

  const clearSessionError = useCallback(() => {
    setSessionError(null);
  }, [
    setSessionError,
  ]);

  useEffect(() => {
    if (!enabled) return;
    const runRevision = revisionRef;
    let disposed = false;
    let listedLoaded = false;
    const bootstrapRevision = ++revisionRef.current;
    invalidateSessionListRequest();
    const listRequestRevision = sessionListRequestRevisionRef.current;
    const runRevisionSnapshot = {
      ...summaryRunRevisionBySessionRef.current,
    };
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
        replaceSessions(listed, runRevisionSnapshot);
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
        replaceSessions(bootstrap.sessions, runRevisionSnapshot);
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
          await restoreRun(session.id, revision, true);
        } else if (bootstrap.selectedId) {
          await selectSession(bootstrap.selectedId, "initial");
        } else if (bootstrap.create) {
          await create();
        }
      } catch (cause) {
        if (isListRequestCurrent()) {
          setSessionError(toSessionError("load-sessions", cause));
          setListStatus("error");
        }
      } finally {
        if (listedLoaded && isListRequestCurrent()) {
          setListStatus("ready");
        }
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
    revisionRef,
    summaryRunRevisionBySessionRef,
    setListStatus,
    activeIdRef,
    setRuntime,
    setActiveError,
    setSessionError,
  ]);

  return {
    writeLocation,
    invalidateSessionListRequest,
    selectSession,
    startNew,
    create,
    ensureSessionForSend,
    refresh,
    rename,
    remove,
    clearSessionError,
  };
}
