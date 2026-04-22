import type { ContestDetail } from "@/core/entities/contest.entity";
import {
  canAccessExamContent,
  isContestParticipant,
  isStrictSubmittedBeforeEnd,
} from "@/features/contest/domain/contestRuntimePolicy";
import { toContestTabSpecs, type ContestTabKey } from "@/features/contest/tabConfig";
import type {
  AdminPanelId,
  ContestStudentTabContentKind,
  ContestTypeModule,
} from "@/features/contest/modules/types";
import CodingTestEditorLayout from "@/features/contest/components/admin/examEditor/CodingTestEditorLayout";
import ContestResultDashboardPanel from "@/features/contest/components/admin/statistics/ContestResultDashboardPanel";
import ContestProblemScreen from "@/features/contest/screens/ContestProblemScreen";
import { getClassroomContestSolvePath } from "@/features/contest/domain/contestRoutePolicy";

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
  if (isStrictSubmittedBeforeEnd(contest)) {
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
  "ai-grading",
  "statistics",
];
const DRAFT_ADMIN_PANELS: AdminPanelId[] = ["overview", "problem_editor"];

export const codingContestModule: ContestTypeModule = {
  type: "coding",
  student: {
    getTabs: (contest) => getCodingTabs(contest),
    getSolveRenderer: () => () => <ContestProblemScreen />,
    getAnsweringEntryPath: (contestId, contest) => {
      const classroomId = contest?.boundClassroomId;
      if (!classroomId) {
        return "/dashboard";
      }
      const firstProblemId = getFirstProblemId(contest);
      return firstProblemId
        ? getClassroomContestSolvePath(classroomId, contestId, firstProblemId)
        : `/classrooms/${classroomId}/contest/${contestId}`;
    },
  },
  admin: {
    editorKind: "coding",
    getAvailablePanels: (contest) =>
      contest?.status === "draft" ? DRAFT_ADMIN_PANELS : CODING_ADMIN_PANELS,
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
      statistics: (props) => <ContestResultDashboardPanel {...props} />,
    }),
    getExportTargets: () => ["coding-pdf", "coding-markdown"],
  },
};
