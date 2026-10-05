import type { ExamQuestion, ExamQuestionType } from "@/core/entities/contest.entity";

/** Placeholder content the editors give a newly added question. */
export const DEFAULT_QUESTION_PROMPT = "New question";
export const DEFAULT_CHOICE_OPTIONS = ["Option A", "Option B"];

const OBJECTIVE_TYPES: ReadonlySet<ExamQuestionType> = new Set([
  "single_choice",
  "multiple_choice",
  "true_false",
]);

export interface ExamPublishIssues {
  /** Display numbers used by the editor and answering pages (stored order + 1). */
  missingAnswer: number[];
  /** Display numbers of questions whose prompt or options are still placeholders. */
  defaultContent: number[];
}

const hasAnswer = (answer: unknown): boolean =>
  answer != null && !(Array.isArray(answer) && answer.length === 0);

export const getExamPublishIssues = (questions: ExamQuestion[]): ExamPublishIssues => {
  const sorted = [...questions].sort((a, b) => a.order - b.order);
  const numbered = sorted.map((question) => ({ question, number: question.order + 1 }));
  return {
    missingAnswer: numbered
      .filter(({ question: q }) => OBJECTIVE_TYPES.has(q.questionType) && !hasAnswer(q.correctAnswer))
      .map(({ number }) => number),
    defaultContent: numbered
      .filter(
        ({ question: q }) =>
          q.prompt.trim() === DEFAULT_QUESTION_PROMPT ||
          q.options.some((option) => DEFAULT_CHOICE_OPTIONS.includes(option.trim())),
      )
      .map(({ number }) => number),
  };
};
