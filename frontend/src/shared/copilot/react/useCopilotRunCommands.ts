import { useCallback, useRef } from "react";
import type {
  CopilotAttachmentPart,
  CopilotError,
  CopilotMessage,
  CopilotSendInput,
  CopilotSendResult,
  CopilotTransport,
} from "@/core/copilot";
import {
  clearEmptyPendingReasoningForRun,
  ownershipChangedError,
  retainLatestResumeSequence,
  toCopilotError,
  type CreateSessionOutcome,
} from "./copilotRuntimeHelpers";
import type { useCopilotRunSubscription } from "./useCopilotRunSubscription";
import type { CopilotRuntimeStore } from "./useCopilotRuntimeStore";

interface CopilotRunCommandsInput {
  transport: CopilotTransport;
  getRunMetadata: (() => Record<string, unknown>) | undefined;
  subscription: ReturnType<typeof useCopilotRunSubscription>;
  ensureSessionForSend: () => Promise<CreateSessionOutcome>;
}

/** Commands that start, stop and answer the active session's run. */
export function useCopilotRunCommands(
  store: CopilotRuntimeStore,
  {
    transport,
    getRunMetadata,
    subscription,
    ensureSessionForSend,
  }: CopilotRunCommandsInput,
) {
  const {
    setRuntime,
    runtimeRef,
    setAttachments,
    enabledRef,
    ownershipEpochRef,
    revisionRef,
    activeIdRef,
    lastSendRef,
    interactionSubmissionRef,
  } = store;
  const {
    setRunState,
    syncSessionSummaryRun,
    closeRunSubscription,
    subscribeToRun,
  } = subscription;
  const getRunMetadataRef = useRef(getRunMetadata);
  getRunMetadataRef.current = getRunMetadata;

  const send = useCallback(
    async (input: CopilotSendInput): Promise<CopilotSendResult> => {
      const text = input.text.trim();
      if (!text && !input.attachments?.length) {
        return {
          accepted: false,
          sessionId: activeIdRef.current ?? "",
          error: {
            code: "validation-error",
            operation: "start-run",
            recoverable: true,
          },
        };
      }
      if (!enabledRef.current) {
        return {
          accepted: false,
          sessionId: activeIdRef.current ?? "",
          error: ownershipChangedError("start-run"),
        };
      }

      // Read host metadata now: session creation and uploads are async, and the
      // host's state (e.g. the current page) may change before the run starts.
      const hostMetadata = getRunMetadataRef.current?.();

      const ensured = await ensureSessionForSend();
      if (!ensured.ok) {
        return { accepted: false, sessionId: "", error: ensured.error };
      }
      const sessionId = ensured.sessionId;
      if (!ensured.activated || activeIdRef.current !== sessionId) {
        return {
          accepted: false,
          sessionId,
          error: ownershipChangedError("start-run"),
        };
      }

      const ownershipEpoch = ownershipEpochRef.current;
      const revision = revisionRef.current;
      const isCurrentSend = () =>
        enabledRef.current &&
        ownershipEpoch === ownershipEpochRef.current &&
        revision === revisionRef.current &&
        activeIdRef.current === sessionId;
      const staleResult = (): CopilotSendResult => ({
        accepted: false,
        sessionId,
        error: ownershipChangedError("start-run"),
      });

      const uploaded: CopilotAttachmentPart[] = [];
      for (const file of input.attachments ?? []) {
        if (!isCurrentSend()) return staleResult();
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
          const uploadedPart = await transport.uploadAttachment(sessionId, file);
          if (!isCurrentSend()) return staleResult();
          uploaded.push(uploadedPart);
          setAttachments((items) =>
            items.map((item) =>
              item.file === file ? { ...item, status: "ready", error: undefined } : item,
            ),
          );
        } catch (cause) {
          if (!isCurrentSend()) return staleResult();
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

      if (!isCurrentSend()) return staleResult();

      const optimisticId =
        (input as CopilotSendInput & { optimisticId?: string }).optimisticId ??
        crypto.randomUUID();
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
        if (
          !session ||
          session.messages.some((message) => message.id === optimisticId)
        ) {
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
        const runMetadata = { ...hostMetadata, ...input.metadata };
        const run = await transport.startRun({
          sessionId,
          text,
          attachments: uploaded,
          modelId: input.modelId,
          idempotencyKey: optimisticId,
          metadata: Object.keys(runMetadata).length > 0 ? runMetadata : undefined,
        });
        if (!isCurrentSend()) return staleResult();
        syncSessionSummaryRun(sessionId, run);
        const assistantId =
          run.assistantMessageId ?? `run-${run.id}-assistant`;
        setRuntime((previous) => {
          const session = previous.sessions[sessionId];
          if (!session) return previous;
          const assistant: CopilotMessage = {
            id: assistantId,
            role: "assistant",
            createdAt: new Date(),
            parts: [{ type: "reasoning", text: "", state: "streaming" }],
            metadata: { optimistic: true, runId: run.id },
          };
          return {
            ...previous,
            sessions: {
              ...previous.sessions,
              [sessionId]: {
                ...session,
                messages: session.messages.some(
                  (message) => message.id === assistantId,
                )
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
        if (!isCurrentSend()) return staleResult();
        const error = toCopilotError("start-run", cause);
        setRunState(sessionId, { status: "error", run: null, error });
        return { accepted: false, sessionId, error };
      }
    },
    [
      activeIdRef,
      enabledRef,
      ensureSessionForSend,
      lastSendRef,
      ownershipEpochRef,
      revisionRef,
      setAttachments,
      setRunState,
      setRuntime,
      subscribeToRun,
      syncSessionSummaryRun,
      transport,
    ],
  );

  const stop = useCallback(async () => {
    if (!enabledRef.current) return;
    const ownershipEpoch = ownershipEpochRef.current;
    const sessionId = activeIdRef.current;
    if (!sessionId) return;
    const state = runtimeRef.current.runs[sessionId];
    const activeRun = !state || state.status === "ready" ? null : state.run;
    setRuntime((previous) => {
      const next = clearEmptyPendingReasoningForRun(
        previous,
        sessionId,
        activeRun?.id,
      );
      return {
        ...next,
        runs: {
          ...next.runs,
          [sessionId]: { status: "ready", run: null },
        },
      };
    });
    closeRunSubscription();
    if (!activeRun) {
      syncSessionSummaryRun(sessionId, null);
      return;
    }
    if (!transport.capabilities.cancellableRuns || !transport.cancelRun) {
      syncSessionSummaryRun(sessionId, null, activeRun.id);
      return;
    }
    try {
      await transport.cancelRun(activeRun.id);
      if (
        !enabledRef.current ||
        ownershipEpoch !== ownershipEpochRef.current
      ) {
        return;
      }
      syncSessionSummaryRun(sessionId, null, activeRun.id);
      const session = await transport.getSession(sessionId);
      if (
        !enabledRef.current ||
        ownershipEpoch !== ownershipEpochRef.current
      ) {
        return;
      }
      setRuntime((previous) => ({
        ...previous,
        sessions: { ...previous.sessions, [sessionId]: session },
      }));
    } catch (cause) {
      if (
        !enabledRef.current ||
        ownershipEpoch !== ownershipEpochRef.current
      ) {
        return;
      }
      syncSessionSummaryRun(sessionId, activeRun);
      setRunState(sessionId, {
        status: "error",
        run: activeRun,
        error: toCopilotError("cancel-run", cause),
      });
    }
  }, [
    activeIdRef,
    closeRunSubscription,
    enabledRef,
    ownershipEpochRef,
    runtimeRef,
    setRunState,
    setRuntime,
    syncSessionSummaryRun,
    transport,
  ]);

  const submitApproval = useCallback(
    (decision: "approve" | "reject"): Promise<void> => {
      if (!enabledRef.current) return Promise.resolve();
      const ownershipEpoch = ownershipEpochRef.current;
      const sessionId = activeIdRef.current;
      if (!sessionId) return Promise.resolve();
      const awaiting = runtimeRef.current.runs[sessionId];
      if (awaiting?.status !== "awaiting-approval") return Promise.resolve();
      const key = `approval:${awaiting.run.id}`;
      if (interactionSubmissionRef.current?.key === key) {
        return interactionSubmissionRef.current.promise;
      }
      const revision = revisionRef.current;
      setRunState(sessionId, {
        ...awaiting,
        interactionError: undefined,
        interactionPending: true,
      });
      const promise = Promise.resolve()
        .then(async () => {
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
              !enabledRef.current ||
              ownershipEpoch !== ownershipEpochRef.current ||
              revision !== revisionRef.current ||
              activeIdRef.current !== sessionId
            ) {
              return;
            }
            syncSessionSummaryRun(sessionId, resumedRun);
            setRunState(sessionId, { status: "streaming", run: resumedRun });
            subscribeToRun(resumedRun);
          } catch (cause) {
            if (
              !enabledRef.current ||
              ownershipEpoch !== ownershipEpochRef.current ||
              revision !== revisionRef.current ||
              activeIdRef.current !== sessionId
            ) {
              return;
            }
            setRunState(sessionId, {
              ...awaiting,
              interactionError: toCopilotError("submit-approval", cause),
              interactionPending: false,
            });
          }
        })
        .finally(() => {
          if (interactionSubmissionRef.current?.promise === promise) {
            interactionSubmissionRef.current = null;
          }
        });
      interactionSubmissionRef.current = { key, promise };
      return promise;
    },
    [
      activeIdRef,
      enabledRef,
      interactionSubmissionRef,
      ownershipEpochRef,
      revisionRef,
      runtimeRef,
      setRunState,
      subscribeToRun,
      syncSessionSummaryRun,
      transport,
    ],
  );

  const submitAnswer = useCallback(
    (answer: string): Promise<void> => {
      if (!enabledRef.current) return Promise.resolve();
      const ownershipEpoch = ownershipEpochRef.current;
      const sessionId = activeIdRef.current;
      if (!sessionId) return Promise.resolve();
      const awaiting = runtimeRef.current.runs[sessionId];
      if (awaiting?.status !== "awaiting-answer") return Promise.resolve();
      const key = `answer:${awaiting.run.id}`;
      if (interactionSubmissionRef.current?.key === key) {
        return interactionSubmissionRef.current.promise;
      }
      const revision = revisionRef.current;
      setRunState(sessionId, {
        ...awaiting,
        interactionError: undefined,
        interactionPending: true,
      });
      const promise = Promise.resolve()
        .then(async () => {
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
              !enabledRef.current ||
              ownershipEpoch !== ownershipEpochRef.current ||
              revision !== revisionRef.current ||
              activeIdRef.current !== sessionId
            ) {
              return;
            }
            syncSessionSummaryRun(sessionId, resumedRun);
            setRunState(sessionId, { status: "streaming", run: resumedRun });
            subscribeToRun(resumedRun);
          } catch (cause) {
            if (
              !enabledRef.current ||
              ownershipEpoch !== ownershipEpochRef.current ||
              revision !== revisionRef.current ||
              activeIdRef.current !== sessionId
            ) {
              return;
            }
            setRunState(sessionId, {
              ...awaiting,
              interactionError: toCopilotError("submit-answer", cause),
              interactionPending: false,
            });
          }
        })
        .finally(() => {
          if (interactionSubmissionRef.current?.promise === promise) {
            interactionSubmissionRef.current = null;
          }
        });
      interactionSubmissionRef.current = { key, promise };
      return promise;
    },
    [
      activeIdRef,
      enabledRef,
      interactionSubmissionRef,
      ownershipEpochRef,
      revisionRef,
      runtimeRef,
      setRunState,
      subscribeToRun,
      syncSessionSummaryRun,
      transport,
    ],
  );

  const retry = useCallback(async () => {
    if (!enabledRef.current) return;
    const input = lastSendRef.current;
    if (input) await send(input);
  }, [
    enabledRef,
    lastSendRef,
    send,
  ]);

  const clearError = useCallback(() => {
    const sessionId = activeIdRef.current;
    if (sessionId) setRunState(sessionId, { status: "ready", run: null });
  }, [
    activeIdRef,
    setRunState,
  ]);

  return { send, stop, submitApproval, submitAnswer, retry, clearError };
}
