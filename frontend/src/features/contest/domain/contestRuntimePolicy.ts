import type { ContestDetail, ContestStatus, ContestType, ExamStatusType } from "@/core/entities/contest.entity";

type ContestTypeTarget = Pick<ContestDetail, "contestType"> | null | undefined;
type ParticipantTarget = Pick<ContestDetail, "hasJoined" | "isRegistered"> | null | undefined;
type ExamStatusTarget = Pick<ContestDetail, "hasStarted" | "examStatus"> | null | undefined;
type TabTarget =
  | Pick<
      ContestDetail,
      | "contestType"
      | "hasJoined"
      | "isRegistered"
      | "hasStarted"
      | "examStatus"
      | "scoreboardVisibleDuringContest"
      | "permissions"
    >
  | null
  | undefined;
type MonitoringTarget =
  | Pick<ContestDetail, "cheatDetectionEnabled" | "examStatus">
  | null
  | undefined;
type ExitTarget =
  | Pick<ContestDetail, "cheatDetectionEnabled" | "status" | "examStatus">
  | null
  | undefined;

const EXAM_CONTENT_STATUSES = new Set<ExamStatusType>([
  "in_progress",
  "paused",
  "locked",
  "submitted",
]);

const EXIT_WARNING_STATUSES = new Set<ExamStatusType>([
  "in_progress",
  "paused",
  "locked",
]);

const PAPER_ANSWERING_OPEN_STATUSES = new Set<ExamStatusType>([
  "in_progress",
  "paused",
  "locked",
]);

const isExamStatusIn = (
  status: ExamStatusType | undefined,
  allowed: Set<ExamStatusType>,
): boolean => (status ? allowed.has(status) : false);

export const isPaperExamContest = (contest: ContestTypeTarget): boolean =>
  contest?.contestType === "paper_exam";

export const isContestParticipant = (contest: ParticipantTarget): boolean =>
  !!(contest?.hasJoined || contest?.isRegistered);

export const hasStartedExam = (contest: ExamStatusTarget): boolean =>
  !!contest && (contest.hasStarted === true || isExamStatusIn(contest.examStatus, EXAM_CONTENT_STATUSES));

export const canAccessExamContent = (contest: TabTarget): boolean =>
  isContestParticipant(contest) && hasStartedExam(contest);

export const canShowSubmissionsTab = (contest: TabTarget): boolean =>
  isContestParticipant(contest) && !isPaperExamContest(contest);

export const canShowStandingsTab = (contest: TabTarget): boolean => {
  if (!canShowSubmissionsTab(contest)) return false;
  return !!(
    contest?.permissions?.canViewFullScoreboard ||
    contest?.scoreboardVisibleDuringContest
  );
};

export const isExamMonitoringActive = (
  contest: MonitoringTarget,
): boolean =>
  !!(contest?.cheatDetectionEnabled && contest.examStatus === "in_progress");

export const shouldWarnOnExit = (
  contest: ExitTarget,
  hasEnded: boolean,
): boolean => {
  if (!contest) return false;
  if (!contest.cheatDetectionEnabled) return false;

  const status: ContestStatus | undefined = contest.status;
  if (status !== "published") return false;
  if (hasEnded) return false;

  return isExamStatusIn(contest.examStatus, EXIT_WARNING_STATUSES);
};

export const shouldForceEndExamOnExit = (
  contest: ExitTarget,
  hasEnded: boolean,
): boolean => shouldWarnOnExit(contest, hasEnded);

export const canOpenPaperAnsweringFromDashboard = (
  contest: TabTarget,
): boolean =>
  isPaperExamContest(contest) &&
  isContestParticipant(contest) &&
  isExamStatusIn(contest?.examStatus, PAPER_ANSWERING_OPEN_STATUSES);

export const getContestType = (
  contest: ContestTypeTarget,
): ContestType | undefined => contest?.contestType;
