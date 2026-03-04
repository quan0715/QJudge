import type { ContestDetail } from "@/core/entities/contest.entity";
import {
  canAccessExamContent,
  isContestParticipant,
} from "@/features/contest/domain/contestRuntimePolicy";
import { toContestTabSpecs, type ContestTabKey } from "@/features/contest/tabConfig";
import type {
  AdminPanelId,
  ContestStudentTabContentKind,
  ContestTypeModule,
} from "@/features/contest/modules/types";
import CodingTestEditorLayout from "@/features/contest/components/admin/examEditor/CodingTestEditorLayout";
import CodingStatisticsPlaceholder from "@/features/contest/components/admin/statistics/CodingStatisticsPlaceholder";

const getFirstProblemId = (contest?: ContestDetail | null): string | undefined => {
  if (!contest?.problems?.length) return undefined;
  const firstProblem = [...contest.problems].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  )[0];
  return firstProblem?.problemId || firstProblem?.id;
};

const canShowSubmissionsTab = (contest?: ContestDetail | null): boolean =>
  isContestParticipant(contest);

const canShowStandingsTab = (contest?: ContestDetail | null): boolean => {
  if (!canShowSubmissionsTab(contest)) return false;
  return !!(
    contest?.permissions?.canViewFullScoreboard ||
    contest?.scoreboardVisibleDuringContest
  );
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
  "clarifications",
  "logs",
  "participants",
  "problem_editor",
  "grading",
  "statistics",
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
    getPanelRenderers: () => ({
      problem_editor: (props) => {
        if (!props.contest) return null;
        return (
          <CodingTestEditorLayout
            contestId={props.contestId}
            contest={props.contest}
          />
        );
      },
      statistics: () => <CodingStatisticsPlaceholder />,
    }),
    getExportTargets: () => ["coding-pdf", "coding-markdown"],
    shouldShowJsonActions: () => false,
  },
};
