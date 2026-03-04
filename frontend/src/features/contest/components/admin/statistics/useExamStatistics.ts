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

  const correctSet = new Set<number>();
  if (Array.isArray(correctAnswer)) {
    for (const v of correctAnswer) {
      correctSet.add(Number(v));
    }
  } else if (correctAnswer !== null && correctAnswer !== undefined) {
    correctSet.add(Number(correctAnswer));
  }

  const safeOptions = Array.isArray(options) ? options : [];

  const counts = new Map<number, number>();
  for (let i = 0; i < safeOptions.length; i++) {
    counts.set(i, 0);
  }

  for (const a of answers) {
    const content = a.answerContent;
    const raw = content?.selected;
    const selected = Array.isArray(raw) ? (raw as number[]) : [];
    for (const idx of selected) {
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

function extractAnswerText(a: GradingAnswerRow): string {
  const content = a.answerContent;
  if (!content) return "";
  if (typeof content.text === "string") return content.text;
  if (typeof content.answer === "string") return content.answer;
  return JSON.stringify(content);
}
