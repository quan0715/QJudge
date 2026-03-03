import { getAvailableContestTabKeys } from "@/features/contest/tabConfig";
import type { ContestTypeModule } from "@/features/contest/modules/types";

export const codingContestModule: ContestTypeModule = {
  type: "coding",
  student: {
    problemsViewKind: "coding",
    getAvailableTabs: (contest) => getAvailableContestTabKeys(contest),
  },
  admin: {
    examEditorKind: "coding",
    exportProfile: "coding",
    shouldShowExamJsonActions: () => false,
  },
};
