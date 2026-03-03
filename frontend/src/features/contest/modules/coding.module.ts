import type { ContestDetail } from "@/core/entities/contest.entity";
import {
  canAccessExamContent,
  canShowStandingsTab,
  canShowSubmissionsTab,
  isContestParticipant,
} from "@/features/contest/domain/contestRuntimePolicy";
import { toContestTabSpecs, type ContestTabKey } from "@/features/contest/tabConfig";
import type { ContestTypeModule } from "@/features/contest/modules/types";

const getFirstProblemId = (contest?: ContestDetail | null): string | undefined => {
  if (!contest?.problems?.length) return undefined;
  const firstProblem = [...contest.problems].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  )[0];
  return firstProblem?.problemId || firstProblem?.id;
};

const getCodingTabs = (contest?: ContestDetail | null) => {
  if (!contest || !isContestParticipant(contest)) {
    return toContestTabSpecs(["overview"]);
  }

  const tabs: ContestTabKey[] = ["overview"];
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

  return toContestTabSpecs(tabs);
};

export const codingContestModule: ContestTypeModule = {
  type: "coding",
  student: {
    problemsViewKind: "coding",
    getTabs: (contest) => getCodingTabs(contest),
    getAnsweringEntryPath: (contestId, contest) => {
      const firstProblemId = getFirstProblemId(contest);
      return firstProblemId
        ? `/contests/${contestId}/solve/${firstProblemId}`
        : `/contests/${contestId}`;
    },
  },
  admin: {
    editorKind: "coding",
    getExportTargets: () => ["coding-pdf", "coding-markdown"],
    shouldShowJsonActions: () => false,
  },
};
