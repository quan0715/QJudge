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
import ExamEditorLayout from "@/features/contest/components/admin/examEditor/ExamEditorLayout";
import ExamStatisticsPanel from "@/features/contest/components/admin/statistics/ExamStatisticsPanel";

const getPaperExamTabs = (contest?: ContestDetail | null) => {
  const keyToContentKind: Record<ContestTabKey, ContestStudentTabContentKind> = {
    overview: "overview",
    problems: "paper_exam_problems",
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
    tabs.push("problems", "clarifications");
  }

  return toTabDefinitions(tabs);
};

const PAPER_EXAM_ADMIN_PANELS: AdminPanelId[] = [
  "overview",
  "clarifications",
  "logs",
  "participants",
  "problem_editor",
  "grading",
  "statistics",
  "settings",
];

export const paperExamContestModule: ContestTypeModule = {
  type: "paper_exam",
  student: {
    getTabs: (contest) => getPaperExamTabs(contest),
    getAnsweringEntryPath: (contestId) =>
      `/contests/${contestId}/paper-exam/answering`,
  },
  admin: {
    editorKind: "paper_exam",
    getAvailablePanels: () => PAPER_EXAM_ADMIN_PANELS,
    getPanelRenderers: () => ({
      problem_editor: (props) => {
        if (!props.contest) return null;
        return (
          <ExamEditorLayout
            contestId={props.contestId}
            contest={props.contest}
            ref={props.panelRef}
          />
        );
      },
      statistics: () => <ExamStatisticsPanel />,
    }),
    getExportTargets: () => ["exam-question", "exam-answer", "exam-json"],
    shouldShowJsonActions: (activePanel) => activePanel === "problem_editor",
  },
};
