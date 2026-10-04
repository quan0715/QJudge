import { lazy } from "react";
import type { ContestDetail } from "@/core/entities/contest.entity";
import type {
  AdminPanelId,
  ContestTypeModule,
} from "@/features/contest/modules/types";
import ContestProblemScreen from "@/features/contest/screens/ContestProblemScreen";
import { getClassroomContestSolvePath } from "@/features/contest/domain/contestRoutePolicy";

const CodingTestEditorLayout = lazy(
  () => import("@/features/contest/components/admin/examEditor/CodingTestEditorLayout"),
);

const getFirstProblemId = (
  contest?: ContestDetail | null,
): string | undefined => {
  if (!contest?.problems?.length) return undefined;
  const firstProblem = [...contest.problems].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  )[0];
  return firstProblem?.problemId || firstProblem?.id;
};

const CODING_ADMIN_PANELS: AdminPanelId[] = [
  "overview",
  "proctoring",
  "problem_editor",
];
const DRAFT_ADMIN_PANELS: AdminPanelId[] = ["overview", "problem_editor"];

export const codingContestModule: ContestTypeModule = {
  type: "coding",
  student: {
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
    }),
    getExportTargets: () => ["coding-pdf", "coding-markdown"],
  },
};
