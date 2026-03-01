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

  const permissions = contest.permissions;
  const hasJoined = contest.hasJoined || contest.isRegistered;

  if (!hasJoined && !permissions?.canEditContest) {
    return ["overview"];
  }

  if (contest.examModeEnabled) {
    const tabs: ContestTabKey[] = ["overview"];

    tabs.push("clarifications");

    return tabs;
  }

  const tabs: ContestTabKey[] = ["overview", "problems", "submissions"];

  if (
    permissions?.canViewFullScoreboard ||
    contest.scoreboardVisibleDuringContest
  ) {
    tabs.push("standings");
  }

  tabs.push("clarifications");

  return tabs;
};
