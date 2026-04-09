import type { ScoreboardData } from "@/core/entities/contest.entity";
import type { ExamQuestion, ExamQuestionType } from "@/core/entities/contest.entity";
import type { ExamAnswerDto } from "@/infrastructure/api/repositories/exam.repository";
import type { DashboardMockData, QuestionSummaryMock, QuestionDetailMock } from "./contestResultDashboard.mock";

interface TransformInput {
  contestName: string;
  courseName: string;
  contestType: "paper_exam" | "coding";
  resultsPublished: boolean;
  standings: ScoreboardData;
  examQuestions: ExamQuestion[];
  examAnswers: ExamAnswerDto[];
}

export function transformToDashboardData(input: TransformInput): DashboardMockData {
  const { standings, examQuestions, examAnswers } = input;
  const participantCount = standings.rows.length;
  const totalScores = standings.rows.map((r) => r.totalScore);
  const maxTotalScore = standings.problems.reduce((sum, p) => sum + p.score, 0);

  const completedCount = standings.rows.filter((r) => r.totalScore > 0).length;
  const averageScore = participantCount > 0
    ? totalScores.reduce((a, b) => a + b, 0) / participantCount
    : 0;
  const medianScore = median(totalScores);

  const scoreDistribution = buildScoreDistribution(totalScores, maxTotalScore);

  const answersByQuestion = groupBy(examAnswers, (a) => a.question_id);
  const orderedProblems = [...standings.problems].sort((a, b) => a.order - b.order);

  const questions: QuestionSummaryMock[] = [];
  const details: Record<string, QuestionDetailMock> = {};

  for (const problem of orderedProblems) {
    const examQ = examQuestions.find((q) => q.order === problem.order);
    if (!examQ) continue;

    const answers = answersByQuestion.get(examQ.id) ?? [];
    const kind = examQ.questionType as ExamQuestionType;

    const questionScores = standings.rows
      .map((row) => row.problems[problem.id]?.score ?? 0);
    const answerCount = answers.length;
    const missingCount = participantCount - answerCount;
    const qAvg = participantCount > 0
      ? questionScores.reduce((a, b) => a + b, 0) / participantCount
      : 0;
    const scoreRate = problem.score > 0 ? Math.round((qAvg / problem.score) * 100) : 0;
    const zeroCount = questionScores.filter((s) => s === 0).length;
    const fullCount = questionScores.filter((s) => s >= problem.score).length;
    const zeroRate = participantCount > 0 ? Math.round((zeroCount / participantCount) * 100) : 0;
    const fullRate = participantCount > 0 ? Math.round((fullCount / participantCount) * 100) : 0;

    const summary: QuestionSummaryMock = {
      questionId: examQ.id,
      order: examQ.order,
      title: examQ.prompt.length > 40 ? examQ.prompt.slice(0, 40) + "…" : examQ.prompt,
      kind,
      maxScore: problem.score,
      answerCount,
      missingCount,
      averageScore: Math.round(qAvg * 10) / 10,
      scoreRate,
      zeroRate,
      fullRate,
      status: "stable",
    };
    questions.push(summary);

    const scoreBands = buildQuestionScoreBands(questionScores, problem.score);

    if (kind === "single_choice" || kind === "multiple_choice" || kind === "true_false") {
      const optionDist = buildOptionDistribution(examQ, answers);
      details[examQ.id] = {
        questionId: examQ.id,
        kind,
        scoreBands,
        optionDistribution: optionDist,
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

  return {
    contest: {
      id: standings.contestId,
      name: input.contestName,
      course: input.courseName,
      contestType: input.contestType,
      participantCount,
      completedCount,
      resultsPublished: input.resultsPublished,
    },
    summary: {
      averageScore: Math.round(averageScore * 10) / 10,
      medianScore,
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
  const step = maxScore <= 10 ? 1 : 10;
  const bucketCount = Math.max(Math.ceil(maxScore / step), 1);
  const buckets = Array.from({ length: bucketCount }, (_, i) => {
    const lo = i * step;
    const hi = Math.min(lo + step - 1, maxScore);
    return {
      rangeLabel: lo === hi ? `${lo}` : `${lo}-${hi}`,
      count: 0,
    };
  });

  for (const score of scores) {
    const idx = Math.min(Math.floor(score / step), bucketCount - 1);
    buckets[idx].count += 1;
  }
  return buckets;
}

function buildQuestionScoreBands(
  scores: number[],
  maxScore: number,
): Array<{ label: string; count: number }> {
  const step = maxScore <= 5 ? 1 : maxScore <= 15 ? 3 : 5;
  const bandCount = Math.max(Math.ceil(maxScore / step), 1);
  const bands = Array.from({ length: bandCount }, (_, i) => {
    const lo = i * step;
    const hi = Math.min(lo + step, maxScore);
    return { label: `${lo}-${hi}`, count: 0 };
  });

  for (const score of scores) {
    const idx = Math.min(Math.floor(score / step), bandCount - 1);
    bands[idx].count += 1;
  }
  return bands;
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
      const ans = a.answer;
      if (Array.isArray(ans)) return ans.includes(idx) || ans.includes(String(idx));
      return ans === idx || ans === String(idx) || ans === optionLabel;
    }).length;

    const isCorrect = Array.isArray(correctAnswer)
      ? correctAnswer.includes(idx) || correctAnswer.includes(String(idx))
      : correctAnswer === idx || correctAnswer === String(idx);

    return {
      label: `${optionLabel}. ${opt.length > 30 ? opt.slice(0, 30) + "…" : opt}`,
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
