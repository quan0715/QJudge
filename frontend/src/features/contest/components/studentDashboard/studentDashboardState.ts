import type {
  ContestDetail,
  ExamQuestion,
  ExamStatusType,
} from "@/core/entities/contest.entity";
import { getContestState } from "@/core/entities/contest.entity";

export type StudentContestPhase = "before" | "during" | "after";

const ACTIVE_EXAM_STATUSES = new Set<ExamStatusType>([
  "in_progress",
  "paused",
  "locked",
]);

export const resolveStudentContestPhase = (
  contest: ContestDetail,
  nowMs: number = Date.now(),
): StudentContestPhase => {
  if (contest.examStatus === "submitted") return "after";
  if (ACTIVE_EXAM_STATUSES.has(contest.examStatus ?? "not_started")) {
    return "during";
  }

  const contestState = getContestState({
    status: contest.status,
    startTime: contest.startTime,
    endTime: contest.endTime,
  }, nowMs);
  if (contestState === "ended") return "after";
  if (contestState === "running") return "during";

  const startMs = Date.parse(contest.startTime);
  if (Number.isFinite(startMs) && nowMs >= startMs) return "during";
  return "before";
};

export interface StudentProgressSummary {
  totalItems: number;
  completedItems: number;
  attemptedItems: number;
  totalScore: number | null;
  maxScore: number;
}

export const buildCodingProgressSummary = (
  contest: ContestDetail,
): StudentProgressSummary => {
  const totalItems = contest.problems?.length || 0;
  const maxScore =
    contest.problems?.reduce(
      (sum, problem) => sum + (problem.maxScore ?? 0),
      0,
    ) ||
    0;
  const completedItems = contest.problems.filter(
    (problem) => problem.userStatus === "AC",
  ).length;
  const attemptedItems = contest.problems.filter(
    (problem) => !!problem.userStatus,
  ).length;
  return {
    totalItems,
    completedItems,
    attemptedItems,
    totalScore: null,
    maxScore,
  };
};

type PaperProgressAnswer = {
  questionId: string | number;
};

type PaperScoreTotals = {
  totalScore: number;
  maxTotalScore: number;
};

/**
 * `publishedTotals` comes from the results endpoint once results are
 * published; totals are never summed here so score policies (excluded,
 * full marks, redistribute) stay the server's call, as in the PDF report.
 */
export const buildPaperProgressSummary = (
  questions: ExamQuestion[],
  answers: PaperProgressAnswer[],
  publishedTotals: PaperScoreTotals | null,
): StudentProgressSummary => {
  const resultQuestionIds = new Set(
    answers.map((answer) => String(answer.questionId)),
  );
  const completedItems = questions.filter((question) =>
    resultQuestionIds.has(String(question.id)),
  ).length;
  const maxScore =
    publishedTotals?.maxTotalScore ??
    questions.reduce((sum, question) => sum + (question.score ?? 0), 0);
  return {
    totalItems: questions.length,
    completedItems,
    attemptedItems: completedItems,
    totalScore: publishedTotals?.totalScore ?? null,
    maxScore,
  };
};
