import type { ChatbotRepository } from "@/core/ports/chatbot.repository";
import type {
  ChatMessage,
  ChatRun,
  ChatRunStatus,
  StreamCallbacks,
  ToolInfo,
  VerificationReport,
} from "@/core/types/chatbot.types";
import type {
  CopilotQuestionRequest,
  CopilotRun,
  CopilotRunEvent,
  CopilotRunObserver,
  CopilotSession,
  CopilotSessionSummary,
  CopilotSubscribeOptions,
  CopilotSubscription,
  CopilotTransport,
} from "@/core/copilot";
import type { ArtifactRecord } from "@/infrastructure/api/repositories/artifact.repository";
import {
  mapArtifactRecordToCopilotAttachment,
  mapChatApprovalToCopilot,
  mapChatRunStatusToCopilot,
  mapChatRunToCopilot,
  mapChatSessionToCopilot,
  mapChatSessionToCopilotSummary,
  mapCopilotRunToChat,
  mapQJudgeError,
  mapToolInfoToCopilotPart,
} from "./chatbotCopilotMapper";

type UploadArtifact = (
  sessionId: string,
  file: File,
  options?: { step?: string },
) => Promise<ArtifactRecord>;

type CopilotRunEventPayload = CopilotRunEvent extends infer Event
  ? Event extends CopilotRunEvent
    ? Omit<Event, "runId" | "sessionId" | "sequence">
    : never
  : never;

function subscriptionDelta(previous: string, next: string): string {
  if (next.startsWith(previous)) return next.slice(previous.length);
  return next;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function createQJudgeCopilotTransport(
  repository: ChatbotRepository,
  uploadArtifact: UploadArtifact,
): CopilotTransport {
  const legacyRuns = new Map<string, ChatRun>();

  const rememberRun = (run: ChatRun): CopilotRun => {
    legacyRuns.set(run.id, run);
    return mapChatRunToCopilot(run);
  };

  return {
    capabilities: {
      resumableStreams: true,
      cancellableRuns: true,
      attachments: true,
      approvals: true,
      questions: true,
    },

    async listSessions(): Promise<CopilotSessionSummary[]> {
      try {
        return (await repository.getSessions()).map(mapChatSessionToCopilotSummary);
      } catch (error) {
        throw mapQJudgeError("load-sessions", error);
      }
    },

    async getSession(id): Promise<CopilotSession> {
      try {
        return mapChatSessionToCopilot(await repository.getSession(id));
      } catch (error) {
        throw mapQJudgeError("load-session", error);
      }
    },

    async createSession(input): Promise<CopilotSession> {
      try {
        const created = await repository.createBackendSession();
        let session = await repository.getSession(created.id);
        if (input?.title && input.title !== session.title) {
          session = await repository.renameSession(created.id, input.title);
        }
        const mapped = mapChatSessionToCopilot(session);
        return input?.metadata
          ? { ...mapped, metadata: { ...mapped.metadata, ...input.metadata } }
          : mapped;
      } catch (error) {
        throw mapQJudgeError("create-session", error);
      }
    },

    async renameSession(id, title): Promise<CopilotSessionSummary> {
      try {
        return mapChatSessionToCopilotSummary(
          await repository.renameSession(id, title),
        );
      } catch (error) {
        throw mapQJudgeError("update-session", error);
      }
    },

    async deleteSession(id): Promise<void> {
      try {
        await repository.deleteSession(id);
      } catch (error) {
        throw mapQJudgeError("update-session", error);
      }
    },

    async startRun(input): Promise<CopilotRun> {
      try {
        return rememberRun(
          await repository.startRun(input.sessionId, input.text, {
            modelOverride: input.modelId,
          }),
        );
      } catch (error) {
        throw mapQJudgeError("start-run", error);
      }
    },

    async getActiveRun(sessionId): Promise<CopilotRun | null> {
      try {
        const run = (await repository.getActiveRuns()).find(
          (candidate) => candidate.sessionId === sessionId,
        );
        return run ? rememberRun(run) : null;
      } catch (error) {
        throw mapQJudgeError("subscribe-run", error);
      }
    },

    subscribeRun(
      run: CopilotRun,
      observer: CopilotRunObserver,
      options: CopilotSubscribeOptions = {},
    ): CopilotSubscription {
      const controller = new AbortController();
      const externalSignal = options.signal;
      let closed = false;
      let sequence = options.fromSequence ?? run.lastSequence ?? 0;
      let textCursor = "";
      let reasoningCursor = "";
      let latestStatus: ChatRunStatus = mapCopilotRunToChat(run).status;
      const toolFingerprints = new Map<string, string>();
      const verificationIterations = new Set<number>();
      const legacyRun = {
        ...(legacyRuns.get(run.id) ?? mapCopilotRunToChat(run)),
        lastEventSeq: options.fromSequence ?? run.lastSequence ?? 0,
      };
      legacyRuns.set(run.id, legacyRun);
      const messageId = String(
        legacyRun.assistantMessageId ?? `run-${run.id}-assistant`,
      );

      const nextSequence = (hint?: number): number => {
        sequence = Math.max(sequence + 1, hint ?? 0);
        return sequence;
      };
      const emit = (
        event: CopilotRunEventPayload,
        sequenceHint?: number,
      ) => {
        if (closed) return;
        observer.next({
          ...event,
          runId: run.id,
          sessionId: run.sessionId,
          sequence: nextSequence(sequenceHint),
        } as CopilotRunEvent);
      };
      const close = () => {
        if (closed) return;
        closed = true;
        externalSignal?.removeEventListener("abort", close);
        controller.abort();
      };
      externalSignal?.addEventListener("abort", close, { once: true });
      if (externalSignal?.aborted) close();

      const emitToolUpdates = (
        tools: ToolInfo[] | undefined,
        sequenceHint?: number,
      ) => {
        for (const [index, tool] of (tools ?? []).entries()) {
          const part = mapToolInfoToCopilotPart(tool, index);
          const fingerprint = JSON.stringify(part);
          if (toolFingerprints.get(part.toolCallId) === fingerprint) continue;
          toolFingerprints.set(part.toolCallId, fingerprint);
          emit({ type: "part-upsert", messageId, part }, sequenceHint);
        }
      };
      const emitVerificationUpdates = (
        reports: VerificationReport[] | undefined,
        sequenceHint?: number,
      ) => {
        for (const report of reports ?? []) {
          if (verificationIterations.has(report.iteration)) continue;
          verificationIterations.add(report.iteration);
          emit(
            {
              type: "part-upsert",
              messageId,
              part: { type: "data-verification", data: report },
            },
            sequenceHint,
          );
        }
      };

      const callbacks: StreamCallbacks = {
        onRunStatus(status) {
          latestStatus = status;
        },
        onMessageUpdate(update: Partial<ChatMessage>) {
          if (update.runStatus) latestStatus = update.runStatus;
          if (typeof update.content === "string") {
            const delta = subscriptionDelta(textCursor, update.content);
            textCursor = update.content;
            if (delta) {
              emit(
                { type: "text-delta", messageId, delta },
                update.lastEventSeq,
              );
            }
          }
          const nextReasoning = update.thinkingInfo?.thinking;
          if (typeof nextReasoning === "string") {
            const delta = subscriptionDelta(reasoningCursor, nextReasoning);
            reasoningCursor = nextReasoning;
            if (delta) {
              emit(
                { type: "reasoning-delta", messageId, delta },
                update.lastEventSeq,
              );
            }
          }
          emitToolUpdates(update.toolExecutions, update.lastEventSeq);
          emitVerificationUpdates(
            update.verificationReports,
            update.lastEventSeq,
          );
          if (update.todoItems) {
            emit(
              {
                type: "part-upsert",
                messageId,
                part: { type: "data-todos", data: update.todoItems },
              },
              update.lastEventSeq,
            );
          }
        },
        onVerificationReport(report) {
          emitVerificationUpdates([report]);
        },
        onTodoItemsUpdate(items) {
          if (!items) return;
          emit({
            type: "part-upsert",
            messageId,
            part: { type: "data-todos", data: items },
          });
        },
        onAwaitingApproval(request) {
          latestStatus = "awaiting_approval";
          emit({
            type: "awaiting-approval",
            request: mapChatApprovalToCopilot(request),
          });
        },
        onAwaitingUserAnswer(request) {
          latestStatus = "awaiting_user_answer";
          const normalized: CopilotQuestionRequest = {
            question: request.question,
            input: request.inputType ?? "text",
            options: request.options,
          };
          emit({ type: "awaiting-answer", request: normalized });
        },
        onNextTurnOptions(nextOptions) {
          emit({
            type: "part-upsert",
            messageId,
            part: { type: "data-next-turn-options", data: nextOptions },
          });
        },
        onComplete() {
          const status = ["completed", "cancelled", "failed"].includes(latestStatus)
            ? mapChatRunStatusToCopilot(latestStatus)
            : "completed";
          emit({ type: "run-status", status });
          if (!closed) observer.complete();
          close();
        },
        onError(message) {
          if (closed) return;
          if (latestStatus === "failed") {
            const error = mapQJudgeError("subscribe-run", message, {
              code: "run-failed",
              recoverable: false,
            });
            emit({ type: "run-status", status: "failed", error });
            observer.complete();
          } else {
            observer.error(mapQJudgeError("subscribe-run", message));
          }
          close();
        },
      };

      void repository
        .subscribeRunEvents(legacyRun, callbacks, { signal: controller.signal })
        .catch((error: unknown) => {
          if (!closed && !isAbortError(error)) {
            observer.error(mapQJudgeError("subscribe-run", error));
            close();
          }
        });

      return {
        close,
        get closed() {
          return closed;
        },
      };
    },

    async cancelRun(runId): Promise<CopilotRun> {
      try {
        return rememberRun(await repository.cancelRun(runId));
      } catch (error) {
        throw mapQJudgeError("cancel-run", error);
      }
    },

    async submitApproval(runId, decision): Promise<CopilotRun> {
      try {
        return rememberRun(await repository.submitRunApproval(runId, decision));
      } catch (error) {
        throw mapQJudgeError("submit-approval", error);
      }
    },

    async submitAnswer(runId, answer): Promise<CopilotRun> {
      try {
        return rememberRun(await repository.submitRunAnswer(runId, answer));
      } catch (error) {
        throw mapQJudgeError("submit-answer", error);
      }
    },

    async uploadAttachment(sessionId, file) {
      try {
        return mapArtifactRecordToCopilotAttachment(
          await uploadArtifact(sessionId, file),
        );
      } catch (error) {
        throw mapQJudgeError("upload-attachment", error);
      }
    },
  };
}
