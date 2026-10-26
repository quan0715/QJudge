import type { ExamPaper, ExamQuestion } from "@/core/entities/contest.entity";
import { buildPaperQuestionLabels } from "@/features/contest/domain/paperQuestionLabels";

export interface GradingWorkbenchUnit {
  id: string;
  label: string;
  title: string;
  sharedStem: string;
  questions: ExamQuestion[];
}

/** One readable line from a Markdown prompt: no heading marks, emphasis or escapes. */
function plainTitle(markdown: string): string {
  return markdown
    .split("\n")[0]
    .replace(/^\s*#+\s*/, "")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, "$1")
    .trim();
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
        label: block.kind === "group" ? labels.get(questions[0]?.id)?.groupLabel ?? "" : firstLabel,
        title:
          block.kind === "group"
            ? plainTitle(block.group.title)
            : plainTitle(block.question.prompt),
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
