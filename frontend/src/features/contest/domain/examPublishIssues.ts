import type { ExamQuestion, ExamQuestionType } from "@/core/entities/contest.entity";
import { buildPaperQuestionLabels } from "./paperQuestionLabels";

/** Placeholder content the editors give a newly added question. */
export const DEFAULT_QUESTION_PROMPT = "New question";
export const DEFAULT_CHOICE_OPTIONS = ["Option A", "Option B"];

const OBJECTIVE_TYPES: ReadonlySet<ExamQuestionType> = new Set([
  "single_choice",
  "multiple_choice",
  "true_false",
]);

export interface ExamPublishIssues {
  /** Canonical paper labels used by the editor and answering pages. */
  missingAnswer: string[];
  /** Canonical labels of questions whose prompt or options are still placeholders. */
  defaultContent: string[];
}

const hasAnswer = (answer: unknown): boolean =>
  answer != null && !(Array.isArray(answer) && answer.length === 0);

export const getExamPublishIssues = (questions: ExamQuestion[]): ExamPublishIssues => {
  const sorted = [...questions].sort((a, b) => a.order - b.order);
  const labels = buildPaperQuestionLabels(sorted);
  const numbered = sorted.map((question) => ({ question, label: labels.get(question.id)!.label }));
  return {
    missingAnswer: numbered
      .filter(({ question: q }) => OBJECTIVE_TYPES.has(q.questionType) && !hasAnswer(q.correctAnswer))
      .map(({ label }) => label),
    defaultContent: numbered
      .filter(
        ({ question: q }) =>
          q.prompt.trim() === DEFAULT_QUESTION_PROMPT ||
          q.options.some((option) => DEFAULT_CHOICE_OPTIONS.includes(option.trim())),
      )
      .map(({ label }) => label),
  };
};

export type ExamPublishIssueKind = "missingAnswer" | "defaultContent";
export interface ExamPublishIssueItem {
  questionId: string;
  kind: ExamPublishIssueKind;
  field: "answer" | "prompt" | "options";
}

export function getExamPublishIssueItems(questions: ExamQuestion[]): ExamPublishIssueItem[] {
  const sorted = [...questions].sort((a, b) => a.order - b.order);
  const missing: ExamPublishIssueItem[] = [];
  const defaults: ExamPublishIssueItem[] = [];
  for (const q of sorted) {
    if (OBJECTIVE_TYPES.has(q.questionType) && !hasAnswer(q.correctAnswer)) missing.push({ questionId: q.id, kind: "missingAnswer", field: "answer" });
    if (q.prompt.trim() === DEFAULT_QUESTION_PROMPT) defaults.push({ questionId: q.id, kind: "defaultContent", field: "prompt" });
    else if (q.options.some(option => DEFAULT_CHOICE_OPTIONS.includes(option.trim()))) defaults.push({ questionId: q.id, kind: "defaultContent", field: "options" });
  }
  return [...missing, ...defaults];
}
