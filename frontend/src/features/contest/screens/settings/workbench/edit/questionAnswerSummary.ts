import type { GradingAnswerRow } from "../../grading/gradingTypes";
export interface QuestionAnswerSummary {
  graded: number;
  total: number;
  average: number | null;
  rate: number | null;
}
export function summarizeQuestionAnswers(
  rows: GradingAnswerRow[],
  maxScore: number,
): QuestionAnswerSummary {
  const scores = rows.flatMap((row) => (row.score == null ? [] : [row.score]));
  const average = scores.length
    ? scores.reduce((sum, score) => sum + score, 0) / scores.length
    : null;
  return {
    graded: scores.length,
    total: rows.length,
    average,
    rate: average !== null && maxScore > 0 ? average / maxScore : null,
  };
}
