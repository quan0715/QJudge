import { getAvailableContestTabKeys } from "@/features/contest/tabConfig";
import type { ContestTypeModule } from "@/features/contest/modules/types";

export const paperExamContestModule: ContestTypeModule = {
  type: "paper_exam",
  student: {
    problemsViewKind: "paper_exam",
    getAvailableTabs: (contest) => getAvailableContestTabKeys(contest),
  },
  admin: {
    examEditorKind: "paper_exam",
    exportProfile: "paper_exam",
    shouldShowExamJsonActions: (activePanel) => activePanel === "exam",
  },
};
