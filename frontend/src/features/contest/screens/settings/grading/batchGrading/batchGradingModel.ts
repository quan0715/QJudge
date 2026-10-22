import type { ChatMessage, ChatRunStatus } from "@/core/types/chatbot.types";
import type { GradingAnswerRow } from "../gradingTypes";
import { parseCsvRecords } from "../gradeCsv";

export const BATCH_GRADING_TASK_TYPE = "grading.batch";
export const BATCH_ARTIFACT_STEP = "batch";
export const BATCH_QUESTION_TYPES: readonly string[] = ["short_answer", "essay"];

export type BatchQuestionStatus =
  | "idle"
  | "skipped"
  | "queued"
  | "running"
  | "awaiting-approval"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused";

/** Statuses that hold the session queue: revert and regrade must wait. */
export const BATCH_ACTIVE_STATUSES: readonly BatchQuestionStatus[] = [
  "queued",
  "running",
  "awaiting-approval",
];

/** Error marker for a run whose finalize step never reported back. */
export const FINALIZE_TIMEOUT_ERROR = "finalizeTimeout";

/**
 * A question still needs AI work when it has ungraded answers and nothing is
 * running for it — including a completed run that left answers unwritten.
 */
export function isUnfinished(state: BatchQuestionState): boolean {
  return (
    state.ungradedCount > 0 &&
    state.status !== "skipped" &&
    !BATCH_ACTIVE_STATUSES.includes(state.status)
  );
}

export interface BatchQuestion {
  questionId: string;
  label: string;
  index: number;
  maxScore: number;
  ungradedRows: GradingAnswerRow[];
  skippedCount: number;
}

export interface BatchQuestionState {
  questionId: string;
  label: string;
  index: number;
  status: BatchQuestionStatus;
  ungradedCount: number;
  writtenCount: number;
  error?: string;
  runId?: string;
  /** The run ended but its finalize step has not written progress yet. */
  finalizing?: boolean;
}

export interface BatchActiveRun {
  id: string;
  status: ChatRunStatus;
}

export interface WrittenRecord {
  examAnswerId: string;
  score: number;
  feedback: string;
}

export const gradeCsvFilename = (questionId: string) => `grade_${questionId}.csv`;
export const writtenCsvFilename = (questionId: string) => `written_${questionId}.csv`;
export const BATCH_JSON_FILENAME = "batch.json";
export const PROGRESS_CSV_FILENAME = "progress.csv";

export function selectBatchQuestions(rows: readonly GradingAnswerRow[]): BatchQuestion[] {
  const byQuestion = new Map<string, BatchQuestion>();
  for (const row of rows) {
    if (!BATCH_QUESTION_TYPES.includes(row.questionType) || row.isAbsent) continue;
    const question = byQuestion.get(row.questionId) ?? {
      questionId: row.questionId,
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

export function buildBatchRunPrompt(input: {
  contestId: string;
  questionId: string;
  label: string;
  maxScore: number;
  regradeNote?: string;
}): string {
  const { contestId, questionId, label, maxScore, regradeNote } = input;
  const note = regradeNote?.trim();
  return [
    `batch_question_id: ${questionId}`,
    `這是整批批改中的一題（${label}，滿分 ${maxScore}）。contest_id: ${contestId}`,
    "請呼叫 task 工具（subagent_type: general-purpose），把下列工作完整交給子代理，然後只回覆子代理交回的一行摘要：",
    `- 讀取 artifact \`${gradeCsvFilename(questionId)}\`，必要時用 qjudge_grading 的 question_detail 取得題目與參考解答；若已有 \`rubric_${questionId}.md\` 先沿用。`,
    `- 建立或更新 \`rubric_${questionId}.md\`，可參考 \`qjudge-exam-grading-sop\` 技能。`,
    `- 逐份閱讀 answer_text，用 artifact_csv_patch（key_column: exam_answer_id）只填 score 與 reason；score 介於 0 到 ${maxScore}。`,
    "- reason 簡短說明給分或扣分依據；學生用英文作答時 reason 也用英文。",
    "- 交回一行摘要：已填幾份、平均分。",
    note ? `重改註記（優先考量，但維持 rubric 一致）：${note}` : "",
    "嚴禁呼叫 qjudge_grading 的 grade、batch_grade、ungrade，也不要發布成績。",
  ]
    .filter(Boolean)
    .join("\n");
}

function batchQuestionIdOf(message: ChatMessage): string | null {
  const match = /^\s*batch_question_id:\s*(\S+)\s*$/.exec(message.content.split("\n", 1)[0] ?? "");
  return match ? match[1] : null;
}

function statusFromActiveRun(status: ChatRunStatus): BatchQuestionStatus {
  if (status === "queued") return "queued";
  if (status === "awaiting_approval" || status === "awaiting_user_answer") {
    return "awaiting-approval";
  }
  return "running";
}

const PROGRESS_STATUSES: readonly BatchQuestionStatus[] = [
  "completed",
  "failed",
  "cancelled",
  "paused",
];

export function deriveBatchState(input: {
  questions: readonly BatchQuestion[];
  messages: readonly ChatMessage[];
  activeRuns: readonly BatchActiveRun[];
  progressCsv: string | null;
  writtenCounts: Record<string, number>;
}): BatchQuestionState[] {
  const latestRunByQuestion = new Map<string, string>();
  const assistantStatusByRun = new Map<string, ChatRunStatus | undefined>();
  for (const message of input.messages) {
    if (!message.runId) continue;
    if (message.role === "user") {
      const questionId = batchQuestionIdOf(message);
      if (questionId) latestRunByQuestion.set(questionId, message.runId);
    } else {
      assistantStatusByRun.set(message.runId, message.runStatus);
    }
  }
  const activeById = new Map(input.activeRuns.map((run) => [run.id, run.status]));
  const progressByRun = new Map(
    (input.progressCsv ? parseCsvRecords(input.progressCsv) : []).map((record) => [
      record.run_id,
      record,
    ]),
  );

  return input.questions.map((question) => {
    const base = {
      questionId: question.questionId,
      label: question.label,
      index: question.index,
      ungradedCount: question.ungradedRows.length,
      writtenCount: input.writtenCounts[question.questionId] ?? 0,
    };
    const runId = latestRunByQuestion.get(question.questionId);
    if (!runId) {
      return { ...base, status: base.ungradedCount === 0 ? "skipped" : "idle" };
    }
    const active = activeById.get(runId);
    if (active) return { ...base, runId, status: statusFromActiveRun(active) };

    const progress = progressByRun.get(runId);
    const progressStatus = progress?.status as BatchQuestionStatus | undefined;
    if (progressStatus && PROGRESS_STATUSES.includes(progressStatus)) {
      return {
        ...base,
        runId,
        status: progressStatus,
        ...(progress?.error ? { error: progress.error } : {}),
      };
    }
    const finished = assistantStatusByRun.get(runId);
    // A finished run without its progress row is still being finalized.
    if (finished === "completed" || finished === "failed") {
      return { ...base, runId, status: "running", finalizing: true };
    }
    return { ...base, runId, status: "cancelled" };
  });
}

/**
 * Downgrade runs that stay "finalizing" past `timeoutMs` to failures so the
 * teacher can resume them. `firstSeen` remembers when each run was first seen
 * finalizing and is pruned of runs that are no longer finalizing.
 */
export function applyFinalizeTimeout(
  states: readonly BatchQuestionState[],
  firstSeen: Map<string, number>,
  now: number,
  timeoutMs: number,
): BatchQuestionState[] {
  const finalizingIds = new Set<string>();
  const result = states.map((state) => {
    if (!state.finalizing || !state.runId) return state;
    finalizingIds.add(state.runId);
    const since = firstSeen.get(state.runId) ?? now;
    firstSeen.set(state.runId, since);
    return now - since >= timeoutMs
      ? { ...state, status: "failed" as const, finalizing: false, error: FINALIZE_TIMEOUT_ERROR }
      : state;
  });
  for (const runId of [...firstSeen.keys()]) {
    if (!finalizingIds.has(runId)) firstSeen.delete(runId);
  }
  return result;
}

export function parseWrittenCsv(text: string | null): WrittenRecord[] {
  if (!text) return [];
  return parseCsvRecords(text).map((record) => ({
    examAnswerId: record.exam_answer_id,
    score: Number(record.score),
    feedback: record.feedback ?? "",
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
