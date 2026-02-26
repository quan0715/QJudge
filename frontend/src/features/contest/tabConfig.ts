import type { ContestDetail } from "@/core/entities/contest.entity";

export type ContestTabKey =
  | "overview"
  | "problems"
  | "submissions"
  | "standings"
  | "clarifications"
  | "settings"
  | "participants"
  | "logs"
  | "exam-questions"
  | "admins";

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

    if (
      permissions?.canViewFullScoreboard ||
      contest.scoreboardVisibleDuringContest
    ) {
      tabs.push("standings");
    }

    tabs.push("clarifications");

    if (permissions?.canEditContest) {
      tabs.push("settings");
    }

    if (permissions?.canViewAllSubmissions) {
      tabs.push("participants", "logs", "exam-questions");
    }

    if (permissions?.canEditContest) {
      tabs.push("admins");
    }

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

  if (permissions?.canEditContest) {
    tabs.push("settings");
  }

  if (permissions?.canViewAllSubmissions) {
    tabs.push("participants", "logs");
  }

  if (permissions?.canEditContest) {
    tabs.push("admins");
  }

  return tabs;
};
