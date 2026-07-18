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
  type CopilotError,
  type CopilotRun,
  type CopilotRunState,
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
  CopilotSessionCommandsContext,
  CopilotStateContext,
  type CopilotSessionListStatus,
} from "./copilotContexts";

const LAST_SESSION_KEY = "copilot:last-session-id";
const defaultTranslations = new DefaultCopilotTranslations();

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
  const [sessions, setSessions] = useState<CopilotSessionSummary[]>([]);
  const [listStatus, setListStatus] =
    useState<CopilotSessionListStatus>("idle");
  const [activeError, setActiveError] = useState<CopilotError | null>(null);
  const revisionRef = useRef(0);
  const activeIdRef = useRef<string | null>(null);
  const sessionsRef = useRef<CopilotSessionSummary[]>([]);
  const subscriptionRef = useRef<CopilotSubscription | null>(null);
  const locationWriteRef = useRef<string | null | undefined>(undefined);

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
        const subscription = transport.subscribeRun(
          run,
          {
            next(event) {
              setRuntime((previous) => reduceCopilotEvent(previous, event));
            },
            error(error) {
              setRuntime((previous) => ({
                ...previous,
                runs: {
                  ...previous.runs,
                  [sessionId]: { status: "error", run, error },
                },
              }));
            },
            complete() {
              setRuntime((previous) => ({
                ...previous,
                runs: {
                  ...previous.runs,
                  [sessionId]: { status: "ready", run: null },
                },
              }));
            },
          },
          { fromSequence: run.lastSequence },
        );
        if (revision === revisionRef.current) subscriptionRef.current = subscription;
        else subscription.close();
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
    [transport],
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

  return (
    <CopilotStateContext.Provider value={stateValue}>
      <CopilotSessionCommandsContext.Provider value={commandsValue}>
        {children}
      </CopilotSessionCommandsContext.Provider>
    </CopilotStateContext.Provider>
  );
}
