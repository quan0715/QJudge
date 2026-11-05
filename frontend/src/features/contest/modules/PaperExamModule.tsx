import type {
  AdminPanelId,
  ContestTypeModule,
} from "@/features/contest/modules/types";
import PaperExamAnsweringScreen from "@/features/contest/screens/paperExam/PaperExamAnsweringScreen";
import { getClassroomContestSolvePath } from "@/features/contest/domain/contestRoutePolicy";

const PAPER_EXAM_ADMIN_PANELS: AdminPanelId[] = [
  "overview",
  "participants",
  "grading-workbench",
];
const DRAFT_ADMIN_PANELS: AdminPanelId[] = ["overview", "grading-workbench"];

export const paperExamContestModule: ContestTypeModule = {
  type: "paper_exam",
  student: {
    getSolveRenderer: () => () => <PaperExamAnsweringScreen />,
    getAnsweringEntryPath: (contestId, contest) => {
      const classroomId = contest?.boundClassroomId;
      if (!classroomId) {
        return "/dashboard";
      }
      return getClassroomContestSolvePath(classroomId, contestId);
    },
  },
  admin: {
    editorKind: "paper_exam",
    getAvailablePanels: (contest) =>
      contest?.status === "draft"
        ? DRAFT_ADMIN_PANELS
        : PAPER_EXAM_ADMIN_PANELS,
    getExportTargets: () => ["exam-question", "exam-answer"],
  },
};
