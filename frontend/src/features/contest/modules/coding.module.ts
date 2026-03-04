import type { ContestDetail } from "@/core/entities/contest.entity";
import {
  canAccessExamContent,
  canShowStandingsTab,
  canShowSubmissionsTab,
  isContestParticipant,
} from "@/features/contest/domain/contestRuntimePolicy";
import { toContestTabSpecs, type ContestTabKey } from "@/features/contest/tabConfig";
import type {
  AdminPanelId,
  ContestStudentTabContentKind,
  ContestTypeModule,
} from "@/features/contest/modules/types";

const getFirstProblemId = (contest?: ContestDetail | null): string | undefined => {
  if (!contest?.problems?.length) return undefined;
  const firstProblem = [...contest.problems].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  )[0];
  return firstProblem?.problemId || firstProblem?.id;
};

const getCodingTabs = (contest?: ContestDetail | null) => {
  const keyToContentKind: Record<ContestTabKey, ContestStudentTabContentKind> = {
    overview: "overview",
    problems: "coding_problems",
    submissions: "submissions",
    standings: "standings",
    clarifications: "clarifications",
  };
  const toTabDefinitions = (keys: ContestTabKey[]) =>
    toContestTabSpecs(keys).map((tab) => ({
      ...tab,
      contentKind: keyToContentKind[tab.key],
    }));

  if (!contest || !isContestParticipant(contest)) {
    return toTabDefinitions(["overview"]);
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

  return toTabDefinitions(tabs);
};

const CODING_ADMIN_PANELS: AdminPanelId[] = [
  "overview",
  "logs",
  "participants",
  "problem_editor",
  "grading",
  "settings",
];

export const codingContestModule: ContestTypeModule = {
  type: "coding",
  student: {
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
    getAvailablePanels: () => CODING_ADMIN_PANELS,
    isFullBleedPanel: (panel) =>
      panel === "problem_editor" || panel === "grading",
    getExportTargets: () => ["coding-pdf", "coding-markdown"],
    shouldShowJsonActions: () => false,
  },
};
