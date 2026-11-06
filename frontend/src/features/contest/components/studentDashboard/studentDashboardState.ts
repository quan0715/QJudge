import type {
  ContestDetail,
  ExamQuestion,
  ExamStatusType,
} from "@/core/entities/contest.entity";
import type { ContestProblemSummary } from "@/core/entities/contest.entity";
import { getContestState } from "@/core/entities/contest.entity";
import type { ExamResultTileState } from "./ExamResultReport";

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
    // Like paper exams, the total appears once results are published.
    totalScore: contest.resultsPublished
      ? contest.problems.reduce((sum, problem) => sum + codingProblemScore(problem), 0)
      : null,
    maxScore,
  };
};

/** A problem's points by the scoreboard's rule: accepted earns full marks, otherwise the best submission. */
export const codingProblemScore = (problem: ContestProblemSummary): number =>
  problem.userStatus === "AC" ? problem.maxScore ?? 0 : problem.userScore ?? 0;

/** One question or problem, reduced to what the post-exam report needs whatever the exam type. */
export interface StudentResultItem {
  key: string;
  label: string;
  answered: boolean;
  /** Earned points once results are published; null before. */
  score: number | null;
  maxScore: number;
  /** Judge verdict, known before publishing; paper answers have none. */
  accepted?: boolean;
}

export const buildCodingResultItems = (contest: ContestDetail): StudentResultItem[] =>
  [...contest.problems]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((problem) => ({
      key: problem.id,
      label: problem.label,
      answered: !!problem.userStatus,
      score: contest.resultsPublished && problem.userStatus ? codingProblemScore(problem) : null,
      maxScore: problem.maxScore ?? 0,
      accepted: problem.userStatus === "AC",
    }));

export const resolveResultTileState = (item: StudentResultItem): ExamResultTileState => {
  if (!item.answered) return "unanswered";
  if (item.score !== null) {
    return item.maxScore > 0 && item.score >= item.maxScore ? "full" : item.score > 0 ? "partial" : "zero";
  }
  if (item.accepted !== undefined) return item.accepted ? "accepted" : "attempted";
  return "answered";
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
