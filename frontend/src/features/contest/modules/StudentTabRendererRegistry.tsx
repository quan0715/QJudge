import { ContestOverview } from "@/features/contest/components/ContestOverview";
import { ContestProblemList } from "@/features/contest/components/ContestProblemList";
import PaperExamResultsList from "@/features/contest/components/exam/PaperExamResultsList";
import ContestSubmissionListScreen from "@/features/contest/screens/ContestSubmissionListScreen";
import ContestStandingsScreen from "@/features/contest/screens/ContestStandingsScreen";
import ContestQAScreen from "@/features/contest/screens/ContestQAScreen";
import type {
  ContestStudentTabContentKind,
  ContestStudentTabRenderer,
  ContestTypeModule,
} from "@/features/contest/modules/types";

const DEFAULT_STUDENT_TAB_RENDERERS: Record<
  ContestStudentTabContentKind,
  ContestStudentTabRenderer
> = {
  overview: ({ contest, maxWidth }) => (
    <ContestOverview contest={contest} maxWidth={maxWidth} />
  ),
  coding_problems: ({ contest, myRank, maxWidth }) => (
    <ContestProblemList
      contest={contest}
      problems={contest.problems || []}
      myRank={myRank}
      maxWidth={maxWidth}
    />
  ),
  paper_exam_problems: ({ contest, maxWidth }) => (
    <PaperExamResultsList contest={contest} maxWidth={maxWidth} />
  ),
  submissions: ({ maxWidth }) => <ContestSubmissionListScreen maxWidth={maxWidth} />,
  standings: ({ maxWidth }) => <ContestStandingsScreen maxWidth={maxWidth} />,
  clarifications: ({ maxWidth }) => <ContestQAScreen maxWidth={maxWidth} />,
};

export const resolveStudentTabRenderer = (
  contestModule: ContestTypeModule,
  contentKind: ContestStudentTabContentKind,
): ContestStudentTabRenderer => {
  const overrides = contestModule.student.getTabRenderers?.() ?? {};
  return overrides[contentKind] ?? DEFAULT_STUDENT_TAB_RENDERERS[contentKind];
};
