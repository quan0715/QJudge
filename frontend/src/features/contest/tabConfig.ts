import type { ContestDetail } from "@/core/entities/contest.entity";
import {
  canAccessExamContent,
  canShowStandingsTab,
  canShowSubmissionsTab,
  isContestParticipant,
} from "@/features/contest/domain/contestRuntimePolicy";

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

  if (!isContestParticipant(contest)) {
    return ["overview"];
  }

  const tabs: ContestTabKey[] = ["overview"];

  // Hide "problems" and "clarifications" before the student starts exam.
  if (canAccessExamContent(contest)) {
    tabs.push("problems");
  }

  if (canShowSubmissionsTab(contest)) {
    tabs.push("submissions");
    if (canShowStandingsTab(contest)) {
      tabs.push("standings");
    }
  }

  if (canAccessExamContent(contest)) {
    tabs.push("clarifications");
  }

  return tabs;
};
