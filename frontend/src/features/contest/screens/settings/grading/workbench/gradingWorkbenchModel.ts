import type { ExamPaper, ExamQuestion } from "@/core/entities/contest.entity";
import { buildPaperQuestionLabels } from "@/features/contest/domain/paperQuestionLabels";

export interface GradingWorkbenchUnit {
  id: string;
  label: string;
  title: string;
  sharedStem: string;
  questions: ExamQuestion[];
}

export function buildWorkbenchUnits(paper: ExamPaper): GradingWorkbenchUnit[] {
  const labels = buildPaperQuestionLabels(paper.questions);
  return paper.blocks
    .map((block) => {
      const questions =
        block.kind === "group" ? block.children : [block.question];
      const firstLabel = labels.get(questions[0]?.id)?.label ?? "";
      return {
        id: block.id,
        label: firstLabel.replace(/\([a-z]+\)$/, ""),
        title:
          block.kind === "group"
            ? block.group.title
            : block.question.prompt.split("\n")[0],
        sharedStem:
          block.kind === "group" ? block.group.sharedStemMarkdown : "",
        questions,
      };
    })
    .filter((unit) => unit.questions.length > 0);
}

export interface GradeDraft {
  score: number;
  feedback: string;
}
