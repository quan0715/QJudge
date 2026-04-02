import type { ContestDetail } from "@/core/entities/contest.entity";
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

export const getClassroomContestDashboardPath = (
  classroomId: string,
  contestId: string,
): string => `/classrooms/${classroomId}/contest/${contestId}`;

export const getClassroomContestAdminPath = (
  classroomId: string,
  contestId: string,
): string => `/classrooms/${classroomId}/contest/${contestId}/admin`;

export const getClassroomContestPrecheckPath = (
  classroomId: string,
  contestId: string,
): string => `/classrooms/${classroomId}/contest/${contestId}/exam-precheck`;

export const getClassroomContestSolvePath = (
  classroomId: string,
  contestId: string,
  problemId?: string,
): string => {
  const base = `/classrooms/${classroomId}/contest/${contestId}/solve`;
  if (!problemId) return base;
  return `${base}/${problemId}`;
};

export const getFirstContestProblemId = (contest: ContestRouteTarget): string | undefined => {
  if (!contest?.problems?.length) return undefined;

  const firstProblem = [...contest.problems].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  )[0];
  return firstProblem?.problemId || firstProblem?.id;
};

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
  const normalizedPath = trimTrailingSlash(pathname);
  const classroomContestRegex = new RegExp(
    `^/classrooms/[^/]+/contest/${contestId}(?:/|$)`,
  );
  return classroomContestRegex.test(normalizedPath);
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

  const normalizedPath = trimTrailingSlash(pathname);
  const classroomContestRegex = new RegExp(
    `^/classrooms/[^/]+/contest/${contestId}(?:/|$)`,
  );
  if (!classroomContestRegex.test(normalizedPath)) return true;

  const tab = new URLSearchParams(search).get("tab");
  return !!tab && tab !== "overview";
};
