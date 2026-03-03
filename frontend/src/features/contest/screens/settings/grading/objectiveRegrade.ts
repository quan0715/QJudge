import { isSubjectiveType } from "./gradingTypes";
import type { GradingAnswerRow, QuestionType } from "./gradingTypes";

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeTrueFalseIndex(value: unknown): number | null {
  if (value === 0 || value === true) return 0;
  if (value === 1 || value === false) return 1;

  const normalized = normalizeString(value)?.toLowerCase();
  if (!normalized) return null;

  if (["0", "true", "t", "yes", "y", "a"].includes(normalized)) return 0;
  if (["1", "false", "f", "no", "n", "b"].includes(normalized)) return 1;
  return null;
}

function normalizeChoiceIndex(
  value: unknown,
  options: string[],
  questionType: QuestionType,
): number | null {
  if (questionType === "true_false") {
    return normalizeTrueFalseIndex(value);
  }

  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  const normalized = normalizeString(value);
  if (!normalized) return null;

  const numeric = Number(normalized);
  if (Number.isInteger(numeric) && numeric >= 0) {
    return numeric;
  }

  const alphaUpper = normalized.toUpperCase();
  if (alphaUpper.length === 1 && alphaUpper >= "A" && alphaUpper <= "Z") {
    return alphaUpper.charCodeAt(0) - 65;
  }

  const lower = normalized.toLowerCase();
  const optionIndex = options.findIndex((opt) => opt.trim().toLowerCase() === lower);
  return optionIndex >= 0 ? optionIndex : null;
}

function normalizeMultipleIndexes(
  value: unknown,
  options: string[],
): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  const normalized = value
    .map((item) => normalizeChoiceIndex(item, options, "multiple_choice"))
    .filter((item): item is number => item !== null);

  if (normalized.length !== value.length) return null;

  return [...new Set(normalized)].sort((a, b) => a - b);
}

function sameNumberArray(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

export function calculateObjectiveExpectedScore(
  row: GradingAnswerRow,
): number | null {
  if (isSubjectiveType(row.questionType)) return null;

  const selectedRaw = (row.answerContent as Record<string, unknown>).selected;
  const options = row.questionOptions ?? [];

  if (row.questionType === "multiple_choice") {
    const selected = normalizeMultipleIndexes(selectedRaw, options);
    const correct = normalizeMultipleIndexes(row.correctAnswer, options);
    if (!selected || !correct) return 0;
    return sameNumberArray(selected, correct) ? row.maxScore : 0;
  }

  const selected = normalizeChoiceIndex(selectedRaw, options, row.questionType);
  const correct = normalizeChoiceIndex(row.correctAnswer, options, row.questionType);
  if (selected === null || correct === null) return 0;

  return selected === correct ? row.maxScore : 0;
}

