import { useMemo } from "react";
import { useGradingData } from "@/features/contest/screens/settings/grading/useGradingData";
import { isSubjectiveType } from "@/features/contest/screens/settings/grading/gradingTypes";
import type {
  GradingAnswerRow,
  QuestionProgress,
  QuestionType,
} from "@/features/contest/screens/settings/grading/gradingTypes";

export interface OptionStat {
  label: string;
  count: number;
  percent: number;
  isCorrect: boolean;
}

export interface SubjectiveEntry {
  studentNickname: string;
  studentUsername: string;
  answerText: string;
  score: number | null;
}

export interface QuestionStatistics {
  questionId: string;
  questionIndex: number;
  questionType: QuestionType;
  prompt: string;
  maxScore: number;
  averageScore: number;
  gradedCount: number;
  totalAnswers: number;
  isObjective: boolean;
  optionDistribution: OptionStat[];
  subjectiveEntries: SubjectiveEntry[];
}

export function useExamStatistics() {
  const {
    answersByQuestion,
    questionProgress,
    loading,
  } = useGradingData();

  const questionStats = useMemo<QuestionStatistics[]>(() => {
    if (!questionProgress || !answersByQuestion) return [];
    return questionProgress.map((qp: QuestionProgress) => {
      const answers = answersByQuestion.get(qp.questionId) ?? [];
      const gradedAnswers = answers.filter((a) => a.score !== null);
      const averageScore =
        gradedAnswers.length > 0
          ? gradedAnswers.reduce((sum, a) => sum + (a.score ?? 0), 0) /
            gradedAnswers.length
          : 0;

      const isObjective = !isSubjectiveType(qp.questionType);

      let optionDistribution: OptionStat[] = [];
      let subjectiveEntries: SubjectiveEntry[] = [];

      if (isObjective) {
        optionDistribution = buildOptionDistribution(answers);
      } else {
        subjectiveEntries = answers.map((a) => ({
          studentNickname: a.studentNickname ?? "",
          studentUsername: a.studentUsername ?? "",
          answerText: extractAnswerText(a),
          score: a.score,
        }));
      }

      return {
        questionId: qp.questionId,
        questionIndex: qp.questionIndex,
        questionType: qp.questionType,
        prompt: qp.prompt ?? "",
        maxScore: qp.maxScore ?? 0,
        averageScore,
        gradedCount: qp.gradedCount,
        totalAnswers: qp.totalAnswers,
        isObjective,
        optionDistribution,
        subjectiveEntries,
      };
    });
  }, [questionProgress, answersByQuestion]);

  return { questionStats, loading };
}

function buildOptionDistribution(answers: GradingAnswerRow[]): OptionStat[] {
  if (answers.length === 0) return [];

  const first = answers[0];
  const options = first.questionOptions ?? [];
  const correctAnswer = first.correctAnswer;
  const questionType = first.questionType;

  const correctSet = new Set<number>();
  const correctIndexes = normalizeSelectedIndexes(correctAnswer, questionType, options);
  for (const idx of correctIndexes) {
    correctSet.add(idx);
  }

  const safeOptions = Array.isArray(options) ? options : [];

  const counts = new Map<number, number>();
  for (let i = 0; i < safeOptions.length; i++) {
    counts.set(i, 0);
  }

  for (const a of answers) {
    const content = a.answerContent;
    const raw = content?.selected;
    const selected = normalizeSelectedIndexes(raw, a.questionType, safeOptions);
    for (const idx of selected) {
      if (idx < 0 || idx >= safeOptions.length) continue;
      counts.set(idx, (counts.get(idx) ?? 0) + 1);
    }
  }

  const total = answers.length;
  return safeOptions.map((label, idx) => ({
    label: String(label ?? ""),
    count: counts.get(idx) ?? 0,
    percent: total > 0 ? Math.round(((counts.get(idx) ?? 0) / total) * 100) : 0,
    isCorrect: correctSet.has(idx),
  }));
}

function normalizeSelectedIndexes(
  value: unknown,
  questionType: QuestionType,
  options: string[],
): number[] {
  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => normalizeChoiceIndex(entry, questionType, options))
      .filter((entry): entry is number => entry !== null);
    return [...new Set(normalized)];
  }

  const single = normalizeChoiceIndex(value, questionType, options);
  return single === null ? [] : [single];
}

function normalizeChoiceIndex(
  value: unknown,
  questionType: QuestionType,
  options: string[],
): number | null {
  if (questionType === "true_false") {
    return normalizeTrueFalseIndex(value);
  }

  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const numeric = Number(trimmed);
  if (Number.isInteger(numeric) && numeric >= 0) return numeric;

  const alpha = trimmed.toUpperCase();
  if (alpha.length === 1 && alpha >= "A" && alpha <= "Z") {
    return alpha.charCodeAt(0) - 65;
  }

  const optionIndex = options.findIndex(
    (opt) => opt.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  return optionIndex >= 0 ? optionIndex : null;
}

function normalizeTrueFalseIndex(value: unknown): number | null {
  if (value === 0 || value === true) return 0;
  if (value === 1 || value === false) return 1;

  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["0", "true", "t", "yes", "y", "a"].includes(normalized)) return 0;
  if (["1", "false", "f", "no", "n", "b"].includes(normalized)) return 1;
  return null;
}

function extractAnswerText(a: GradingAnswerRow): string {
  const content = a.answerContent;
  if (!content) return "";
  if (typeof content.text === "string") return content.text;
  if (typeof content.answer === "string") return content.answer;
  return JSON.stringify(content);
}
