import type { ContestDetail, ContestStatus, ContestType, ExamStatusType } from "@/core/entities/contest.entity";

type ContestTypeTarget = Pick<ContestDetail, "contestType"> | null | undefined;
type ParticipantTarget = Pick<ContestDetail, "hasJoined"> | null | undefined;
type ExamStatusTarget = Pick<ContestDetail, "examStatus"> | null | undefined;
type WorkspaceNavigationTarget =
  | Pick<ContestDetail, "examStatus" | "hasJoined">
  | null
  | undefined;
type TabTarget =
  | Pick<
      ContestDetail,
      | "contestType"
      | "hasJoined"
      | "examStatus"
      | "endTime"
      | "cheatDetectionEnabled"
      | "scoreboardVisibleDuringContest"
      | "permissions"
    >
  | null
  | undefined;
type StrictSubmittedTarget =
  | Pick<ContestDetail, "examStatus" | "cheatDetectionEnabled" | "endTime">
  | null
  | undefined;
type MonitoringTarget =
  | Pick<ContestDetail, "isExamMonitored">
  | null
  | undefined;
type ExitTarget =
  | Pick<ContestDetail, "isExamMonitored" | "status" | "examStatus">
  | null
  | undefined;

const EXAM_STARTED_STATUSES = new Set<ExamStatusType>([
  "in_progress",
  "paused",
  "locked",
  "submitted",
]);

const EXAM_CONTENT_ACCESS_STATUSES = new Set<ExamStatusType>([
  "in_progress",
  "submitted",
]);

const EXIT_WARNING_STATUSES = new Set<ExamStatusType>([
  "in_progress",
  "paused",
  "locked",
]);

const WORKSPACE_NAVIGATION_LOCK_STATUSES = new Set<ExamStatusType>([
  "in_progress",
  "paused",
  "locked",
]);

const isExamStatusIn = (
  status: ExamStatusType | undefined,
  allowed: Set<ExamStatusType>,
): boolean => (status ? allowed.has(status) : false);

export const isContestParticipant = (contest: ParticipantTarget): boolean =>
  !!contest?.hasJoined;

export const hasStartedExam = (contest: ExamStatusTarget): boolean =>
  !!contest && isExamStatusIn(contest.examStatus, EXAM_STARTED_STATUSES);

export const shouldLockContestWorkspaceNavigation = (
  contest: WorkspaceNavigationTarget,
): boolean =>
  !!contest?.hasJoined &&
  isExamStatusIn(contest.examStatus, WORKSPACE_NAVIGATION_LOCK_STATUSES);

const parseEndTimeMs = (endTime: string | undefined): number | null => {
  if (!endTime) return null;
  const parsed = Date.parse(endTime);
  return Number.isNaN(parsed) ? null : parsed;
};

export const isStrictSubmittedBeforeEnd = (
  contest: StrictSubmittedTarget,
  nowMs: number = Date.now(),
): boolean => {
  if (!contest?.cheatDetectionEnabled) return false;
  if (contest.examStatus !== "submitted") return false;

  const endMs = parseEndTimeMs(contest.endTime);
  if (endMs === null) return true;
  return nowMs < endMs;
};

export const canAccessExamContent = (
  contest: TabTarget,
  nowMs: number = Date.now(),
): boolean => {
  if (!isContestParticipant(contest)) return false;
  if (!contest) return false;
  if (isStrictSubmittedBeforeEnd(contest, nowMs)) return false;

  return isExamStatusIn(contest.examStatus, EXAM_CONTENT_ACCESS_STATUSES);
};

export const isExamMonitoringActive = (
  contest: MonitoringTarget,
): boolean => !!contest?.isExamMonitored;

export const shouldWarnOnExit = (
  contest: ExitTarget,
  hasEnded: boolean,
): boolean => {
  if (!contest) return false;
  if (!contest.isExamMonitored) return false;
  if (!isExamStatusIn(contest.examStatus, EXIT_WARNING_STATUSES)) return false;

  const status: ContestStatus | undefined = contest.status;
  if (status !== "published") return false;
  if (hasEnded) return false;

  return true;
};

export const shouldForceEndExamOnExit = (
  contest: ExitTarget,
  hasEnded: boolean,
): boolean => shouldWarnOnExit(contest, hasEnded);

export const getContestType = (
  contest: ContestTypeTarget,
): ContestType | undefined => contest?.contestType;
