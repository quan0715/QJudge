import type { ContestDetail } from "@/core/entities/contest.entity";
import {
  canAccessExamContent,
  isContestParticipant,
} from "@/features/contest/domain/contestRuntimePolicy";
import { toContestTabSpecs, type ContestTabKey } from "@/features/contest/tabConfig";
import type { ContestTypeModule } from "@/features/contest/modules/types";

const getPaperExamTabs = (contest?: ContestDetail | null) => {
  if (!contest || !isContestParticipant(contest)) {
    return toContestTabSpecs(["overview"]);
  }

  const tabs: ContestTabKey[] = ["overview"];
  if (canAccessExamContent(contest)) {
    tabs.push("problems", "clarifications");
  }

  return toContestTabSpecs(tabs);
};

export const paperExamContestModule: ContestTypeModule = {
  type: "paper_exam",
  student: {
    problemsViewKind: "paper_exam",
    getTabs: (contest) => getPaperExamTabs(contest),
    getAnsweringEntryPath: (contestId) =>
      `/contests/${contestId}/paper-exam/answering`,
  },
  admin: {
    editorKind: "paper_exam",
    getExportTargets: () => ["exam-question", "exam-answer", "exam-json"],
    shouldShowJsonActions: (activePanel) => activePanel === "exam",
  },
};
