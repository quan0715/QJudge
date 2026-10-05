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
  /** Display numbers (order + 1) of objective questions without a correct answer. */
  missingAnswer: number[];
  /** Display numbers of questions whose prompt or options are still placeholders. */
  defaultContent: number[];
}

const hasAnswer = (answer: unknown): boolean =>
  answer != null && !(Array.isArray(answer) && answer.length === 0);

export const getExamPublishIssues = (questions: ExamQuestion[]): ExamPublishIssues => {
  const sorted = [...questions].sort((a, b) => a.order - b.order);
  return {
    missingAnswer: sorted
      .filter((q) => OBJECTIVE_TYPES.has(q.questionType) && !hasAnswer(q.correctAnswer))
      .map((q) => q.order + 1),
    defaultContent: sorted
      .filter(
        (q) =>
          q.prompt.trim() === DEFAULT_QUESTION_PROMPT ||
          q.options.some((option) => DEFAULT_CHOICE_OPTIONS.includes(option.trim())),
      )
      .map((q) => q.order + 1),
  };
};
