import type {
  ContestDetail,
  ExamQuestion,
  ExamStatusType,
  ScoreboardData,
  ScoreboardRow,
} from "@/core/entities/contest.entity";
import type { User } from "@/core/entities/auth.entity";
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

export const findCurrentUserScoreboardRow = (
  scoreboardData: ScoreboardData | null | undefined,
  currentUser: User | null | undefined,
): ScoreboardRow | null => {
  if (!scoreboardData?.rows?.length || !currentUser) return null;

  const userId = String(currentUser.id);
  const directMatch = scoreboardData.rows.find(
    (row) => String(row.userId) === userId,
  );
  if (directMatch) return directMatch;

  const nameCandidates = new Set(
    [
      currentUser.username,
      currentUser.profile?.display_name,
      currentUser.email,
    ]
      .filter(Boolean)
      .map((value) => String(value)),
  );
  return (
    scoreboardData.rows.find((row) => nameCandidates.has(row.displayName)) ??
    null
  );
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
      (sum, problem) => sum + (problem.maxScore ?? problem.score ?? 0),
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
  score?: number | null;
};

export const buildPaperProgressSummary = (
  questions: ExamQuestion[],
  answers: PaperProgressAnswer[],
  resultsPublished: boolean,
): StudentProgressSummary => {
  const resultQuestionIds = new Set(
    answers.map((answer) => String(answer.questionId)),
  );
  const completedItems = questions.filter((question) =>
    resultQuestionIds.has(String(question.id)),
  ).length;
  const totalScore = resultsPublished
    ? answers.reduce((sum, answer) => sum + (answer.score ?? 0), 0)
    : null;
  const maxScore = questions.reduce(
    (sum, question) => sum + (question.score ?? 0),
    0,
  );
  return {
    totalItems: questions.length,
    completedItems,
    attemptedItems: completedItems,
    totalScore,
    maxScore,
  };
};
