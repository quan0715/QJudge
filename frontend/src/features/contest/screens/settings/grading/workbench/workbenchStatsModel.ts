import { roundScore } from "@/shared/utils/scoreFormat";
import type { GradingAnswerRow } from "../gradingTypes";

/** Scores read as plain numbers in the workbench: 12, 3.5, 2.75. */
export const compactScore = (value: number) => String(roundScore(value));
import { correctOptionIndexes, selectedOptionIndexes } from "../objectiveRegrade";
import type { WorkbenchStudentRow } from "./workbenchRowModel";

export interface QuestionStats {
  average: number | null;
  /** average / maxScore, as a 0–1 ratio. */
  rate: number | null;
  graded: number;
  total: number;
}

export function computeQuestionStats(rows: readonly WorkbenchStudentRow[], maxScore: number): QuestionStats {
  const totals = rows.flatMap((row) => (row.total === null ? [] : [row.total]));
  const average = totals.length ? totals.reduce((sum, value) => sum + value, 0) / totals.length : null;
  return {
    average,
    rate: average === null || maxScore === 0 ? null : average / maxScore,
    graded: totals.length,
    total: rows.length,
  };
}

export interface OptionCount {
  label: string;
  count: number;
  correct: boolean;
}

export function countOptions(rows: readonly GradingAnswerRow[]): OptionCount[] {
  const first = rows[0];
  if (!first) return [];
  const labels =
    first.questionType === "true_false"
      ? ["是", "否"]
      : (first.questionOptions ?? []).map((_, index) => String.fromCharCode(65 + index));
  const correct = new Set(correctOptionIndexes(first));
  const counts = labels.map(() => 0);
  for (const row of rows) {
    for (const index of selectedOptionIndexes(row)) {
      if (index < counts.length) counts[index] += 1;
    }
  }
  return labels.map((label, index) => ({ label, count: counts[index], correct: correct.has(index) }));
}
