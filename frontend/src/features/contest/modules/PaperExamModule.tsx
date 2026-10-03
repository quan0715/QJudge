import { lazy } from "react";
import type {
  AdminPanelId,
  ContestTypeModule,
} from "@/features/contest/modules/types";
import PaperExamAnsweringScreen from "@/features/contest/screens/paperExam/PaperExamAnsweringScreen";
import { getClassroomContestSolvePath } from "@/features/contest/domain/contestRoutePolicy";

const ExamEditorLayout = lazy(
  () => import("@/features/contest/components/admin/examEditor/ExamEditorLayout"),
);

const PAPER_EXAM_ADMIN_PANELS: AdminPanelId[] = [
  "overview",
  "proctoring",
  "problem_editor",
  "grading",
  "ai-grading",
];
const DRAFT_ADMIN_PANELS: AdminPanelId[] = ["overview", "problem_editor"];

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
    getPanelRenderers: () => ({
      problem_editor: (props) => {
        if (!props.contest) return null;
        return (
          <ExamEditorLayout
            contestId={props.contestId}
            contest={props.contest}
            onExport={props.onExport}
            onPreview={props.onPreview}
          />
        );
      },
    }),
    getExportTargets: () => ["exam-question", "exam-answer"],
  },
};
