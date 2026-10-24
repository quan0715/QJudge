export { getExamQuestions as readBatchQuestions } from "@/infrastructure/api/repositories/examQuestions.repository";
/**
 * Batch grading data access. Kept apart from the hook so copilot-aware code
 * never imports the chatbot repository directly (copilot dogfood boundary).
 */
import {
  getBatchGradeWrites,
  getGradingProgress,
  getGradingUnit,
  type GradingUnitDetail,
  type GradingUnitProgress,
} from "@/infrastructure/api/repositories/examAnswers.repository";
import type { ChatMessage } from "@/core/types/chatbot.types";
import chatbotRepository from "@/infrastructure/api/repositories/chatbot.repository";
import { currentWrites, type BatchActiveRun, type WrittenRecord } from "./batchGradingModel";

/** The AI's rubric and drafts for a question's unit; null before the agent opened it. */
export type BatchQuestionFiles = GradingUnitDetail | null;

export interface BatchRemoteState {
  messages: ChatMessage[];
  activeRuns: BatchActiveRun[];
  /** Backend progress of each grading unit the agent opened. */
  units: GradingUnitProgress[];
  /** The AI's grades that nobody has changed since. */
  written: WrittenRecord[];
}

export async function listSessionActiveRuns(sessionId: string): Promise<BatchActiveRun[]> {
  return (await chatbotRepository.getActiveRuns())
    .filter((run) => run.sessionId === sessionId)
    .map((run) => ({ id: run.id, status: run.status }));
}

export async function startBatchRun(sessionId: string, prompt: string, modelId: string | undefined): Promise<void> {
  await chatbotRepository.startRun(sessionId, prompt, { modelOverride: modelId });
}

export async function cancelBatchRun(runId: string): Promise<void> {
  await chatbotRepository.cancelRun(runId);
}

export async function defaultBatchModelId(): Promise<string> {
  const models = await chatbotRepository.getModels();
  const model = models.find((item) => item.is_default) ?? models[0];
  if (!model) throw new Error("沒有可用的批改模型");
  return model.model_id;
}

export async function readWrites(contestId: string, sessionId: string): Promise<WrittenRecord[]> {
  return currentWrites(await getBatchGradeWrites(contestId, sessionId));
}

export function readGradingUnit(contestId: string, sessionId: string, unitId: string): Promise<GradingUnitDetail> {
  return getGradingUnit(contestId, sessionId, unitId);
}

const sameRunIds = (a: readonly BatchActiveRun[], b: readonly BatchActiveRun[]) =>
  a.length === b.length && a.every((run) => b.some((other) => other.id === run.id));

/**
 * The session's messages only say which run asked for which questions and how runs
 * ended, so they are re-read only when the set of active runs changes.
 */
export async function fetchBatchRemoteState(
  contestId: string,
  sessionId: string,
  previous?: Pick<BatchRemoteState, "messages" | "activeRuns">,
): Promise<BatchRemoteState> {
  const [activeRuns, written, units] = await Promise.all([
    listSessionActiveRuns(sessionId),
    readWrites(contestId, sessionId),
    getGradingProgress(contestId, sessionId),
  ]);
  const messages =
    previous && sameRunIds(previous.activeRuns, activeRuns)
      ? previous.messages
      : (await chatbotRepository.getSession(sessionId)).messages;
  return { messages, activeRuns, units, written };
}
