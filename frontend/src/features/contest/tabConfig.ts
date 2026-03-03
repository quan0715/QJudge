import type { ContestDetail } from "@/core/entities/contest.entity";

export type ContestTabKey =
  | "overview"
  | "problems"
  | "submissions"
  | "standings"
  | "clarifications";

export const getAvailableContestTabKeys = (
  contest?: ContestDetail | null
): ContestTabKey[] => {
  if (!contest) {
    return ["overview"];
  }

  const { permissions } = contest;
  const hasJoined = contest.hasJoined || contest.isRegistered;
  const hasStartedExam =
    contest.hasStarted ||
    contest.examStatus === "in_progress" ||
    contest.examStatus === "paused" ||
    contest.examStatus === "locked" ||
    contest.examStatus === "submitted";

  if (!hasJoined) {
    return ["overview"];
  }

  const tabs: ContestTabKey[] = ["overview"];
  const isPaperExam = contest.contestType === "paper_exam";
  const canAccessExamContent = hasStartedExam;

  // Hide "problems" and "clarifications" before the student starts exam.
  if (canAccessExamContent) {
    tabs.push("problems");
  }

  if (!isPaperExam) {
    tabs.push("submissions");
    if (
      permissions?.canViewFullScoreboard ||
      contest.scoreboardVisibleDuringContest
    ) {
      tabs.push("standings");
    }
  }

  if (canAccessExamContent) {
    tabs.push("clarifications");
  }

  return tabs;
};
