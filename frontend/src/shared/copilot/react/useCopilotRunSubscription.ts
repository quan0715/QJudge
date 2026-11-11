import { useCallback, useRef } from "react";
import {
  reduceCopilotEvent,
  type CopilotRun,
  type CopilotRunState,
  type CopilotSessionSummary,
  type CopilotSubscription,
  type CopilotTransport,
} from "@/core/copilot";
import {
  ACTIVE_RUN_ID_KEY,
  clearEmptyPendingReasoning,
  clearEmptyPendingReasoningForRun,
  isTerminalRun,
  summaryFromSession,
  toCopilotError,
  toRunState,
  withActiveRunMetadata,
} from "./copilotRuntimeHelpers";
import type { CopilotRuntimeStore } from "./useCopilotRuntimeStore";

/** Session summary reconciliation plus the active run's event subscription. */
export function useCopilotRunSubscription(
  store: CopilotRuntimeStore,
  transport: CopilotTransport,
) {
  const {
    setRuntime,
    runtimeRef,
    setSessions,
    sessionsRef,
    enabledRef,
    ownershipEpochRef,
    revisionRef,
    activeIdRef,
    summaryRunBySessionRef,
    summaryTerminalRunIdBySessionRef,
    summaryRunRevisionBySessionRef,
    summaryRunRevisionRef,
    summarySequenceByRunRef,
    reconnectTimerRef,
  } = store;
  const subscriptionRef = useRef<CopilotSubscription | null>(null);
  const subscriptionTokenRef = useRef<object | null>(null);
  const restoreRunRef = useRef<
    ((sessionId: string, revision: number, freshSnapshot?: boolean) => Promise<void>) | null
  >(null);

  const setRunState = useCallback((sessionId: string, run: CopilotRunState) => {
    setRuntime((previous) => ({
      ...previous,
      runs: { ...previous.runs, [sessionId]: run },
    }));
  }, [
    setRuntime,
  ]);

  const replaceSessions = useCallback(
    (
      next: CopilotSessionSummary[],
      requestRunRevisionSnapshot?: Readonly<Record<string, number>>,
    ) => {
      if (requestRunRevisionSnapshot) {
        for (const sessionId of Object.keys(summaryRunBySessionRef.current)) {
          const currentRevision =
            summaryRunRevisionBySessionRef.current[sessionId] ?? 0;
          const requestRevision = requestRunRevisionSnapshot[sessionId] ?? 0;
          const hasLiveSubscription =
            activeIdRef.current === sessionId &&
            subscriptionRef.current !== null;
          if (currentRevision <= requestRevision && !hasLiveSubscription) {
            delete summaryRunBySessionRef.current[sessionId];
          }
        }
      }
      const reconciled = next.map((summary) => {
        if (
          Object.prototype.hasOwnProperty.call(
            summaryRunBySessionRef.current,
            summary.id,
          )
        ) {
          return withActiveRunMetadata(
            summary,
            summaryRunBySessionRef.current[summary.id],
          );
        }
        const terminalRunId =
          summaryTerminalRunIdBySessionRef.current[summary.id];
        const listedRunId = summary.metadata?.[ACTIVE_RUN_ID_KEY];
        if (terminalRunId && listedRunId === terminalRunId) {
          return withActiveRunMetadata(summary, null);
        }
        if (
          terminalRunId &&
          typeof listedRunId === "string" &&
          listedRunId !== terminalRunId
        ) {
          delete summaryTerminalRunIdBySessionRef.current[summary.id];
        }
        return summary;
      });
      sessionsRef.current = reconciled;
      setSessions(reconciled);
    },
    [
      activeIdRef,
      sessionsRef,
      setSessions,
      summaryRunBySessionRef,
      summaryRunRevisionBySessionRef,
      summaryTerminalRunIdBySessionRef,
    ],
  );

  const syncSessionSummaryRun = useCallback(
    (sessionId: string, run: CopilotRun | null, terminalRunId?: string) => {
      summaryRunBySessionRef.current[sessionId] = run;
      if (run) {
        delete summaryTerminalRunIdBySessionRef.current[sessionId];
      } else if (terminalRunId) {
        summaryTerminalRunIdBySessionRef.current[sessionId] = terminalRunId;
      }
      summaryRunRevisionBySessionRef.current[sessionId] =
        ++summaryRunRevisionRef.current;
      let changed = false;
      const next = sessionsRef.current.map((summary) => {
        if (summary.id !== sessionId) return summary;
        changed = true;
        return withActiveRunMetadata(summary, run);
      });
      if (changed) replaceSessions(next);
    },
    [
      replaceSessions,
      sessionsRef,
      summaryRunBySessionRef,
      summaryRunRevisionBySessionRef,
      summaryRunRevisionRef,
      summaryTerminalRunIdBySessionRef,
    ],
  );

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current === null) return;
    clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }, [
    reconnectTimerRef,
  ]);

  const closeRunSubscription = useCallback(() => {
    clearReconnectTimer();
    subscriptionTokenRef.current = null;
    subscriptionRef.current?.close();
    subscriptionRef.current = null;
  }, [clearReconnectTimer]);

  const subscribeToRun = useCallback(
    (run: CopilotRun) => {
      if (!enabledRef.current) return;
      closeRunSubscription();
      const revision = revisionRef.current;
      const ownershipEpoch = ownershipEpochRef.current;
      const token = {};
      subscriptionTokenRef.current = token;
      let latestObservedStatus = run.status;
      let latestObservedRun = run;
      let capturedSubscription: CopilotSubscription | null = null;
      const subscription = transport.subscribeRun(
        run,
        {
          next(event) {
            if (
              subscriptionTokenRef.current !== token ||
              !enabledRef.current ||
              ownershipEpoch !== ownershipEpochRef.current ||
              revision !== revisionRef.current ||
              activeIdRef.current !== run.sessionId
            ) {
              return;
            }
            const lastSummarySequence =
              summarySequenceByRunRef.current[event.runId] ?? -1;
            if (event.sequence <= lastSummarySequence) return;
            summarySequenceByRunRef.current[event.runId] = event.sequence;
            if (event.type === "awaiting-approval") {
              latestObservedStatus = "awaiting-approval";
              latestObservedRun = {
                ...latestObservedRun,
                status: "awaiting-approval",
                approvalRequest: event.request,
              };
              syncSessionSummaryRun(run.sessionId, latestObservedRun);
            } else if (event.type === "awaiting-answer") {
              latestObservedStatus = "awaiting-answer";
              latestObservedRun = {
                ...latestObservedRun,
                status: "awaiting-answer",
                questionRequest: event.request,
              };
              syncSessionSummaryRun(run.sessionId, latestObservedRun);
            } else if (event.type === "run-status") {
              latestObservedStatus = event.status;
              latestObservedRun = {
                ...latestObservedRun,
                status: event.status,
              };
              syncSessionSummaryRun(
                run.sessionId,
                isTerminalRun(latestObservedRun) ? null : latestObservedRun,
                isTerminalRun(latestObservedRun)
                  ? latestObservedRun.id
                  : undefined,
              );
            }
            setRuntime((previous) =>
              clearEmptyPendingReasoning(
                reduceCopilotEvent(previous, event),
                event,
              ),
            );
          },
          error(error) {
            if (
              subscriptionTokenRef.current !== token ||
              !enabledRef.current ||
              ownershipEpoch !== ownershipEpochRef.current ||
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
              setRuntime((previous) =>
                clearEmptyPendingReasoningForRun(
                  previous,
                  run.sessionId,
                  run.id,
                ),
              );
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
            }, Math.max(1_000, error.retryAfterMs ?? 0));
          },
          complete(freshSession) {
            if (
              subscriptionTokenRef.current !== token ||
              !enabledRef.current ||
              ownershipEpoch !== ownershipEpochRef.current ||
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
            // Runs queue per session (e.g. batch grading): pick up the next one, if any.
            void restoreRunRef.current?.(run.sessionId, revisionRef.current);
            if (!freshSession || freshSession.id !== run.sessionId) return;
            replaceSessions(
              sessionsRef.current.map((summary) =>
                summary.id === freshSession.id
                  ? summaryFromSession(freshSession)
                  : summary,
              ),
            );
            setRuntime((previous) => ({
              ...previous,
              sessions: {
                ...previous.sessions,
                [freshSession.id]: freshSession,
              },
            }));
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
    [
      activeIdRef,
      clearReconnectTimer,
      closeRunSubscription,
      enabledRef,
      ownershipEpochRef,
      reconnectTimerRef,
      replaceSessions,
      revisionRef,
      sessionsRef,
      setRunState,
      setRuntime,
      summarySequenceByRunRef,
      syncSessionSummaryRun,
      transport,
    ],
  );

  const restoreRun = useCallback(
    async (sessionId: string, revision: number, freshSnapshot = false) => {
      if (!enabledRef.current) return;
      const ownershipEpoch = ownershipEpochRef.current;
      const summaryRunId = sessionsRef.current.find(
        (summary) => summary.id === sessionId,
      )?.metadata?.[ACTIVE_RUN_ID_KEY];
      const previousRunId =
        summaryRunBySessionRef.current[sessionId]?.id ??
        runtimeRef.current.runs[sessionId]?.run?.id ??
        (typeof summaryRunId === "string" ? summaryRunId : undefined);
      closeRunSubscription();
      if (!transport.capabilities.resumableStreams || !transport.getActiveRun) {
        syncSessionSummaryRun(sessionId, null);
        setRuntime((previous) => {
          const next = clearEmptyPendingReasoningForRun(
            previous,
            sessionId,
            previousRunId,
          );
          return {
            ...next,
            runs: {
              ...next.runs,
              [sessionId]: { status: "ready", run: null },
            },
          };
        });
        return;
      }
      try {
        const run = await transport.getActiveRun(sessionId);
        if (
          !enabledRef.current ||
          ownershipEpoch !== ownershipEpochRef.current ||
          revision !== revisionRef.current ||
          activeIdRef.current !== sessionId
        ) {
          return;
        }
        if (!run) {
          syncSessionSummaryRun(sessionId, null, previousRunId);
          setRuntime((previous) => {
            const next = clearEmptyPendingReasoningForRun(
              previous,
              sessionId,
              previousRunId,
            );
            return {
              ...next,
              runs: {
                ...next.runs,
                [sessionId]: { status: "ready", run: null },
              },
            };
          });
          return;
        }
        const localSequence = freshSnapshot ? undefined : runtimeRef.current.lastResumeSequenceByRun[run.id];
        const lastSequence = Math.max(
          run.lastSequence ?? -1,
          localSequence ?? -1,
        );
        const restoredRun =
          lastSequence >= 0 ? { ...run, lastSequence } : run;
        if (freshSnapshot) delete summarySequenceByRunRef.current[run.id];
        syncSessionSummaryRun(sessionId, restoredRun);
        setRuntime((previous) => {
          const session = previous.sessions[sessionId];
          if (!session) return previous;
          const assistantId = restoredRun.assistantMessageId ?? `run-${restoredRun.id}-assistant`;
          // Show a thinking placeholder only before the run has any assistant output.
          const lastMessage = session.messages[session.messages.length - 1];
          const messages = lastMessage?.role === "assistant" || session.messages.some((message) => message.id === assistantId)
            ? session.messages
            : [...session.messages, {
                id: assistantId,
                role: "assistant" as const,
                createdAt: new Date(),
                parts: [{ type: "reasoning" as const, text: "", state: "streaming" as const }],
                metadata: { optimistic: true, runId: restoredRun.id },
              }];
          return {
            ...previous,
            sessions: { ...previous.sessions, [sessionId]: { ...session, messages } },
            runs: { ...previous.runs, [sessionId]: toRunState(restoredRun) },
            ...(freshSnapshot ? {
              lastSequenceByRun: { ...previous.lastSequenceByRun, [run.id]: -1 },
              lastResumeSequenceByRun: {
                ...previous.lastResumeSequenceByRun, [run.id]: restoredRun.lastSequence ?? 0,
              },
            } : {}),
          };
        });
        if (revision === revisionRef.current) subscribeToRun(restoredRun);
      } catch (error) {
        if (
          !enabledRef.current ||
          ownershipEpoch !== ownershipEpochRef.current ||
          revision !== revisionRef.current
        ) {
          return;
        }
        const restoreError = toCopilotError("subscribe-run", error);
        setRuntime((previous) => {
          const next = clearEmptyPendingReasoningForRun(
            previous,
            sessionId,
            previousRunId,
          );
          return {
            ...next,
            runs: {
              ...next.runs,
              [sessionId]: {
                status: "error",
                run: null,
                error: restoreError,
              },
            },
          };
        });
        if (restoreError.recoverable) {
          clearReconnectTimer();
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            if (!enabledRef.current || ownershipEpoch !== ownershipEpochRef.current
              || revision !== revisionRef.current || activeIdRef.current !== sessionId) return;
            void restoreRunRef.current?.(sessionId, revision, freshSnapshot);
          }, Math.max(1_000, restoreError.retryAfterMs ?? 0));
        }
      }
    },
    [
      activeIdRef,
      clearReconnectTimer,
      closeRunSubscription,
      enabledRef,
      ownershipEpochRef,
      reconnectTimerRef,
      revisionRef,
      runtimeRef,
      sessionsRef,
      setRuntime,
      subscribeToRun,
      summaryRunBySessionRef,
      summarySequenceByRunRef,
      syncSessionSummaryRun,
      transport,
    ],
  );
  // eslint-disable-next-line react-hooks/refs -- latest-value ref, written during render
  restoreRunRef.current = restoreRun;

  return {
    setRunState,
    replaceSessions,
    syncSessionSummaryRun,
    clearReconnectTimer,
    closeRunSubscription,
    subscribeToRun,
    restoreRun,
  };
}
