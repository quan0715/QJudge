import type { ExamQuestion, ExamQuestionType } from "@/core/entities/contest.entity";
import type { ExamAnswerDto } from "@/infrastructure/api/repositories/exam.repository";
import type { DashboardMockData, QuestionSummaryMock, QuestionDetailMock } from "./contestResultDashboard.mock";

interface TransformInput {
  contestId: string;
  contestName: string;
  courseName: string;
  resultsPublished: boolean;
  /** Per-participant total scores from ContestParticipant.score */
  participantScores: number[];
  examQuestions: ExamQuestion[];
  /** null = not loaded yet (phase 1), array = loaded (phase 2) */
  examAnswers: ExamAnswerDto[] | null;
}

export function transformToDashboardData(input: TransformInput): DashboardMockData {
  const { examQuestions, examAnswers, participantScores } = input;
  const participantCount = participantScores.length;

  const maxTotalScore = examQuestions.reduce((sum, q) => sum + q.score, 0);
  const completedCount = participantScores.filter((s) => s > 0).length;
  const averageScore = participantCount > 0
    ? participantScores.reduce((a, b) => a + b, 0) / participantCount
    : 0;
  const medianScore = median(participantScores);
  const scoreDistribution = buildScoreDistribution(participantScores, maxTotalScore);

  const answersByQuestion = examAnswers
    ? groupBy(examAnswers, (a) => a.question_id)
    : null;

  const sortedQuestions = [...examQuestions].sort((a, b) => a.order - b.order);

  const questions: QuestionSummaryMock[] = [];
  const details: Record<string, QuestionDetailMock> = {};

  for (const examQ of sortedQuestions) {
    const answers = answersByQuestion?.get(examQ.id) ?? [];
    const kind = examQ.questionType as ExamQuestionType;

    // Only count graded answers for averages
    const gradedAnswers = answers.filter((a) => a.score !== null && a.score !== undefined);
    const gradedScores = gradedAnswers.map((a) => Number(a.score));

    const answerCount = answers.length;
    const missingCount = participantCount - answerCount;

    // Average over graded answers only (not all participants)
    const qAvg = gradedScores.length > 0
      ? gradedScores.reduce((a, b) => a + b, 0) / gradedScores.length
      : 0;
    const scoreRate = examQ.score > 0 ? Math.round((qAvg / examQ.score) * 100) : 0;

    const zeroCount = gradedScores.filter((s) => s === 0).length;
    const fullCount = gradedScores.filter((s) => s >= examQ.score).length;
    const zeroRate = gradedScores.length > 0 ? Math.round((zeroCount / gradedScores.length) * 100) : 0;
    const fullRate = gradedScores.length > 0 ? Math.round((fullCount / gradedScores.length) * 100) : 0;

    const summary: QuestionSummaryMock = {
      questionId: examQ.id,
      order: examQ.order,
      title: examQ.prompt,
      kind,
      maxScore: examQ.score,
      answerCount,
      missingCount,
      averageScore: Math.round(qAvg * 10) / 10,
      scoreRate,
      zeroRate,
      fullRate,
      status: "stable",
    };
    questions.push(summary);

    // Details only available when answers are loaded
    if (answersByQuestion) {
      const scoreBands = buildQuestionScoreBands(gradedScores, examQ.score);

      if (kind === "single_choice" || kind === "multiple_choice" || kind === "true_false") {
        details[examQ.id] = {
          questionId: examQ.id,
          kind,
          scoreBands,
          optionDistribution: buildOptionDistribution(examQ, answers),
          omittedCount: missingCount,
        };
      } else if (kind === "short_answer" || kind === "essay") {
        const graded = answers.filter((a) => a.graded_at !== null).length;
        details[examQ.id] = {
          questionId: examQ.id,
          kind,
          scoreBands,
          gradingProgress: { graded, total: answers.length },
        };
      } else {
        details[examQ.id] = {
          questionId: examQ.id,
          kind: "essay",
          scoreBands,
          gradingProgress: { graded: answers.length, total: answers.length },
        };
      }
    }
  }

  return {
    contest: {
      id: input.contestId,
      name: input.contestName,
      course: input.courseName,
      contestType: "paper_exam",
      participantCount,
      completedCount,
      resultsPublished: input.resultsPublished,
    },
    summary: {
      averageScore: Math.round(averageScore * 10) / 10,
      medianScore,
      maxTotalScore,
    },
    scoreDistribution,
    questions,
    details,
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function buildScoreDistribution(
  scores: number[],
  maxScore: number,
): Array<{ rangeLabel: string; count: number }> {
  if (maxScore <= 0) return [{ rangeLabel: "0", count: scores.length }];
  const step = maxScore <= 10 ? 1 : 10;
  const bucketCount = Math.max(Math.ceil(maxScore / step), 1);
  const buckets = Array.from({ length: bucketCount }, (_, i) => {
    const lo = i * step;
    const hi = Math.min(lo + step - 1, maxScore);
    return { rangeLabel: lo === hi ? `${lo}` : `${lo}-${hi}`, count: 0 };
  });
  for (const score of scores) {
    const raw = Number(score) || 0;
    const idx = Math.max(0, Math.min(Math.floor(raw / step), bucketCount - 1));
    buckets[idx].count += 1;
  }
  return buckets;
}

function buildQuestionScoreBands(
  scores: number[],
  maxScore: number,
): Array<{ label: string; count: number }> {
  if (maxScore <= 0) return [{ label: "0", count: scores.length }];
  const step = maxScore <= 5 ? 1 : maxScore <= 15 ? 3 : 5;
  const bandCount = Math.max(Math.ceil(maxScore / step), 1);
  const bands = Array.from({ length: bandCount }, (_, i) => {
    const lo = i * step;
    const hi = Math.min(lo + step, maxScore);
    return { label: `${lo}-${hi}`, count: 0 };
  });
  for (const score of scores) {
    const raw = Number(score) || 0;
    const idx = Math.max(0, Math.min(Math.floor(raw / step), bandCount - 1));
    bands[idx].count += 1;
  }
  return bands;
}

function extractSelected(answer: unknown): number | number[] | null {
  if (answer == null) return null;
  if (typeof answer === "number") return answer;
  if (typeof answer === "object" && "selected" in (answer as Record<string, unknown>)) {
    return (answer as Record<string, unknown>).selected as number | number[];
  }
  return null;
}

function buildOptionDistribution(
  question: ExamQuestion,
  answers: ExamAnswerDto[],
): Array<{ label: string; count: number; percent: number; isCorrect: boolean }> {
  const options = question.options ?? [];
  const correctAnswer = question.correctAnswer;
  const total = answers.length || 1;

  return options.map((opt, idx) => {
    const optionLabel = String.fromCharCode(65 + idx);
    const count = answers.filter((a) => {
      const sel = extractSelected(a.answer);
      if (sel === null) return false;
      if (Array.isArray(sel)) return sel.includes(idx);
      return sel === idx;
    }).length;

    let isCorrect = false;
    if (Array.isArray(correctAnswer)) {
      isCorrect = correctAnswer.includes(idx);
    } else if (typeof correctAnswer === "number") {
      isCorrect = correctAnswer === idx;
    }

    return {
      label: `${optionLabel}. ${opt}`,
      count,
      percent: Math.round((count / total) * 100),
      isCorrect,
    };
  });
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = map.get(key);
    if (group) group.push(item);
    else map.set(key, [item]);
  }
  return map;
}
