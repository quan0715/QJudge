import type { BatchGradeWrite, GradingUnitProgress } from "@/infrastructure/api/repositories/examAnswers.repository";
import type { ChatMessage, ChatRunStatus } from "@/core/types/chatbot.types";
import type { GradingAnswerRow } from "../gradingTypes";

export const BATCH_GRADING_TASK_TYPE = "grading.batch";
export const BATCH_QUESTION_TYPES: readonly string[] = ["short_answer", "essay"];

export type BatchQuestionStatus =
  | "idle"
  | "skipped"
  | "queued"
  | "running"
  | "awaiting-approval"
  | "completed"
  | "failed"
  | "cancelled";

/** Statuses that hold the session queue: revert and regrade must wait. */
export const BATCH_ACTIVE_STATUSES: readonly BatchQuestionStatus[] = [
  "queued",
  "running",
  "awaiting-approval",
];

/** A question still needs AI work when it has ungraded answers and nothing is running for it. */
export function isUnfinished(state: BatchQuestionState): boolean {
  return (
    state.ungradedCount > 0 &&
    state.status !== "skipped" &&
    !BATCH_ACTIVE_STATUSES.includes(state.status)
  );
}

export interface BatchQuestion {
  questionId: string;
  groupId?: string | null;
  label: string;
  index: number;
  maxScore: number;
  ungradedRows: GradingAnswerRow[];
  skippedCount: number;
}

export interface BatchQuestionState {
  questionId: string;
  groupId?: string | null;
  label: string;
  index: number;
  status: BatchQuestionStatus;
  ungradedCount: number;
  writtenCount: number;
  error?: string;
  runId?: string;
}

export interface BatchActiveRun {
  id: string;
  status: ChatRunStatus;
}

export interface WrittenRecord {
  examAnswerId: string;
  questionId: string;
  score: number;
  feedback: string;
}

export function selectBatchQuestions(rows: readonly GradingAnswerRow[]): BatchQuestion[] {
  const byQuestion = new Map<string, BatchQuestion>();
  for (const row of rows) {
    if (!BATCH_QUESTION_TYPES.includes(row.questionType) || row.isAbsent) continue;
    const question = byQuestion.get(row.questionId) ?? {
      questionId: row.questionId,
      groupId: row.questionGroupId,
      label: `Q${row.questionLabel ?? row.questionIndex}`,
      index: row.questionIndex,
      maxScore: row.maxScore,
      ungradedRows: [],
      skippedCount: 0,
    };
    if (row.score === null) question.ungradedRows.push(row);
    else question.skippedCount += 1;
    byQuestion.set(row.questionId, question);
  }
  return [...byQuestion.values()].sort((a, b) => a.index - b.index);
}

/** Question ids a run was asked to grade, from its `batch_units:` line. */
export function requestedQuestionIds(message: ChatMessage): string[] {
  const line = /^batch_units: (.+)$/m.exec(message.content)?.[1];
  if (!line) return [];
  try {
    return (JSON.parse(line) as { question_ids?: string[] }[]).flatMap((unit) => unit.question_ids ?? []);
  } catch {
    return [];
  }
}

function statusFromActiveRun(status: ChatRunStatus): BatchQuestionStatus {
  if (status === "queued") return "queued";
  if (status === "awaiting_approval" || status === "awaiting_user_answer") return "awaiting-approval";
  return "running";
}

/**
 * Each question follows the last run that asked for it: running while that run is
 * active, completed once its unit was submitted, otherwise how the run ended.
 */
export function deriveBatchState(input: {
  questions: readonly BatchQuestion[];
  messages: readonly ChatMessage[];
  activeRuns: readonly BatchActiveRun[];
  units: readonly GradingUnitProgress[];
  written: readonly WrittenRecord[];
}): BatchQuestionState[] {
  const latestRunByQuestion = new Map<string, string>();
  const runEnd = new Map<string, { status?: ChatRunStatus; error?: string }>();
  for (const message of input.messages) {
    if (!message.runId) continue;
    if (message.role === "user") {
      for (const questionId of requestedQuestionIds(message)) latestRunByQuestion.set(questionId, message.runId);
    } else {
      runEnd.set(message.runId, { status: message.runStatus, error: message.runError });
    }
  }
  const activeById = new Map(input.activeRuns.map((run) => [run.id, run.status]));

  return input.questions.map((question) => {
    const base = {
      questionId: question.questionId,
      groupId: question.groupId,
      label: question.label,
      index: question.index,
      ungradedCount: question.ungradedRows.length,
      writtenCount: input.written.filter((record) => record.questionId === question.questionId).length,
    };
    const runId = latestRunByQuestion.get(question.questionId);
    if (!runId) return { ...base, status: base.ungradedCount === 0 ? "skipped" : "idle" };
    const active = activeById.get(runId);
    if (active) return { ...base, runId, status: statusFromActiveRun(active) };
    const unit = input.units.find((item) => item.run_id === runId && item.question_ids.includes(question.questionId));
    if (unit?.status === "completed") return { ...base, runId, status: "completed" };
    const end = runEnd.get(runId);
    if (end?.status === "cancelled") return { ...base, runId, status: "cancelled" };
    return { ...base, runId, status: "failed", ...(end?.error ? { error: end.error } : {}) };
  });
}

/** The AI's writes the backend still reports as unchanged. */
export function currentWrites(writes: readonly BatchGradeWrite[]): WrittenRecord[] {
  return writes
    .filter((write) => write.current)
    .map((write) => ({
      examAnswerId: write.exam_answer_id,
      questionId: write.question_id,
      score: write.score,
      feedback: write.feedback,
    }));
}

export function selectRevertableAnswers(
  written: readonly WrittenRecord[],
  rows: readonly GradingAnswerRow[],
): string[] {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  return written
    .filter((record) => {
      const current = rowsById.get(record.examAnswerId);
      return (
        current !== undefined &&
        current.score !== null &&
        Number(current.score) === record.score &&
        (current.feedback ?? "") === record.feedback
      );
    })
    .map((record) => record.examAnswerId);
}
