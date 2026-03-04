import type { ContestDetail, ExamStatusType } from "@/core/entities/contest.entity";
import { getContestTypeModule } from "@/features/contest/modules/registry";

type ContestRouteTarget =
  | Pick<ContestDetail, "contestType" | "problems" | "examStatus" | "cheatDetectionEnabled">
  | null
  | undefined;

const trimTrailingSlash = (path: string): string =>
  path.endsWith("/") ? path.slice(0, -1) : path;

export const getContestDashboardPath = (contestId: string): string =>
  `/contests/${contestId}`;

export const getContestPrecheckPath = (contestId: string): string =>
  `/contests/${contestId}/exam-precheck`;

export const getContestPaperAnsweringPath = (
  contestId: string,
  questionId?: string,
): string => {
  const base = `/contests/${contestId}/paper-exam/answering`;
  if (!questionId) return base;
  return `${base}?q=${encodeURIComponent(questionId)}`;
};

export const getContestPaperSubmitReviewPath = (contestId: string): string =>
  `/contests/${contestId}/paper-exam/submit-review`;

export const getContestSolvePath = (contestId: string, problemId: string): string =>
  `/contests/${contestId}/solve/${problemId}`;

export const getFirstContestProblemId = (contest: ContestRouteTarget): string | undefined => {
  if (!contest?.problems?.length) return undefined;

  const firstProblem = [...contest.problems].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  )[0];
  return firstProblem?.problemId || firstProblem?.id;
};

export const getPostPrecheckPath = (
  contestId: string,
  contest: ContestRouteTarget,
): string =>
  getContestTypeModule(contest?.contestType).student.getAnsweringEntryPath(
    contestId,
    contest as ContestDetail | null | undefined,
  );

export const getContestAnsweringEntryPath = (
  contestId: string,
  contest: ContestRouteTarget,
): string => getPostPrecheckPath(contestId, contest);

export const shouldRouteToPrecheck = (params: {
  contest: ContestRouteTarget;
  precheckPassed: boolean;
}): boolean => {
  const { contest, precheckPassed } = params;
  if (!contest?.cheatDetectionEnabled) return false;

  if (
    contest.examStatus === "not_started" ||
    contest.examStatus === "paused"
  ) {
    return true;
  }

  return contest.examStatus === "in_progress" && !precheckPassed;
};

export const getPaperSubmitReviewBackPath = (params: {
  contestId: string;
  examStatus?: ExamStatusType;
  cheatDetectionEnabled?: boolean;
  precheckPassed: boolean;
}): string => {
  const { contestId, examStatus, cheatDetectionEnabled, precheckPassed } = params;
  if (!cheatDetectionEnabled) {
    return getContestPaperAnsweringPath(contestId);
  }
  if (
    examStatus === "paused" ||
    (examStatus === "in_progress" && !precheckPassed)
  ) {
    return getContestPrecheckPath(contestId);
  }
  return getContestPaperAnsweringPath(contestId);
};

export const isPathWithinContest = (params: {
  contestId: string;
  pathname: string;
}): boolean => {
  const { contestId, pathname } = params;
  const contestBase = getContestDashboardPath(contestId);
  const normalizedPath = trimTrailingSlash(pathname);
  return normalizedPath === contestBase || normalizedPath.startsWith(`${contestBase}/`);
};
