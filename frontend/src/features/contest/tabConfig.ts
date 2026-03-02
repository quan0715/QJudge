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

  if (!hasJoined && !permissions?.canEditContest) {
    return ["overview"];
  }

  const tabs: ContestTabKey[] = ["overview", "problems"];
  const isPaperExam = (contest.examQuestionsCount ?? 0) > 0;

  if (!isPaperExam) {
    tabs.push("submissions");
    if (
      permissions?.canViewFullScoreboard ||
      contest.scoreboardVisibleDuringContest
    ) {
      tabs.push("standings");
    }
  }

  tabs.push("clarifications");

  return tabs;
};
