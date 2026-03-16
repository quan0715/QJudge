import type { ContestDetail } from "@/core/entities/contest.entity";
import { getContestTypeModule } from "@/features/contest/modules/registry";
import { isStrictSubmittedBeforeEnd } from "@/features/contest/domain/contestRuntimePolicy";

type ContestRouteTarget =
  | Pick<
      ContestDetail,
      | "contestType"
      | "problems"
      | "examStatus"
      | "cheatDetectionEnabled"
      | "endTime"
    >
  | null
  | undefined;

const trimTrailingSlash = (path: string): string =>
  path.endsWith("/") ? path.slice(0, -1) : path;

export const getContestDashboardPath = (contestId: string): string =>
  `/contests/${contestId}`;

export const getContestPrecheckPath = (contestId: string): string =>
  `/contests/${contestId}/exam-precheck`;

export const getContestSolveRootPath = (
  contestId: string,
  questionId?: string,
): string => {
  const base = `/contests/${contestId}/solve`;
  if (!questionId) return base;
  return `${base}?q=${encodeURIComponent(questionId)}`;
};

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

export const isPathWithinContest = (params: {
  contestId: string;
  pathname: string;
}): boolean => {
  const { contestId, pathname } = params;
  const contestBase = getContestDashboardPath(contestId);
  const normalizedPath = trimTrailingSlash(pathname);
  return normalizedPath === contestBase || normalizedPath.startsWith(`${contestBase}/`);
};

export const shouldRedirectToOverviewOnStrictSubmitted = (params: {
  contestId: string;
  contest: ContestRouteTarget;
  pathname: string;
  search?: string;
  nowMs?: number;
}): boolean => {
  const { contestId, contest, pathname, search = "", nowMs } = params;
  if (!isStrictSubmittedBeforeEnd(contest, nowMs)) return false;

  const contestBase = getContestDashboardPath(contestId);
  const normalizedPath = trimTrailingSlash(pathname);
  if (normalizedPath !== contestBase) return true;

  const tab = new URLSearchParams(search).get("tab");
  return !!tab && tab !== "overview";
};
