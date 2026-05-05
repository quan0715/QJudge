import type { ContestDetail, ExamQuestionType } from "@/core/entities/contest.entity";

export type DashboardQuestionKind = "coding" | ExamQuestionType;
export type DashboardSortMode = "attention" | "order" | "average_asc" | "zero_desc" | "grading_desc";

export interface DashboardMockData {
  contest: {
    id: string;
    name: string;
    course: string;
    contestType: "paper_exam" | "coding";
    participantCount: number;
    completedCount: number;
    resultsPublished: boolean;
  };
  summary: {
    averageScore: number;
    medianScore: number;
    maxTotalScore: number;
    passThreshold?: number;
  };
  scoreDistribution: Array<{
    rangeLabel: string;
    count: number;
  }>;
  questions: QuestionSummaryMock[];
  details: Record<string, QuestionDetailMock>;
}

export interface QuestionSummaryMock {
  questionId: string;
  order: number;
  title: string;
  kind: DashboardQuestionKind;
  maxScore: number;
  answerCount: number;
  missingCount: number;
  averageScore: number;
  scoreRate: number;
  zeroRate: number;
  fullRate: number;
  status: "stable" | "attention" | "grading";
  objectiveStats?: {
    correctRate: number;
  };
  subjectiveStats?: {
    gradedCount: number;
    pendingCount: number;
    gradingRate: number;
  };
}

interface BaseQuestionDetailMock {
  questionId: string;
  kind: DashboardQuestionKind;
  scoreBands: Array<{ label: string; count: number }>;
  responses: Array<{
    participantId: number;
    username: string;
    displayName: string;
    score: number | null;
    gradedAt: string | null;
    feedback: string;
    answer: unknown;
  }>;
}

export type QuestionDetailMock =
  | (BaseQuestionDetailMock & {
      kind: "single_choice" | "multiple_choice" | "true_false";
      optionDistribution: Array<{
        label: string;
        count: number;
        percent: number;
        isCorrect: boolean;
        participants: Array<{
          participantId: number;
          username: string;
          displayName: string;
        }>;
      }>;
      omittedCount: number;
      omittedParticipants?: Array<{
        participantId: number;
        username: string;
        displayName: string;
      }>;
    })
  | (BaseQuestionDetailMock & {
      kind: "short_answer" | "essay";
      gradingProgress: { graded: number; total: number };
    })
  | (BaseQuestionDetailMock & {
      kind: "coding";
      statusDistribution: Array<{ status: string; count: number }>;
      avgSubmissions: number;
      medianFirstAcMinutes: number | null;
      commonFailures: Array<{ status: string; count: number }>;
    });

export const dashboardTypeLabels: Record<DashboardQuestionKind, string> = {
  coding: "Coding",
  single_choice: "單選",
  multiple_choice: "多選",
  true_false: "是非",
  short_answer: "簡答",
  essay: "申論",
};

export function createContestResultDashboardMock(
  contest?: ContestDetail | null,
): DashboardMockData {
  if (contest?.contestType === "coding") {
    return createCodingDashboardMock(contest);
  }

  const questions: QuestionSummaryMock[] = [
    {
      questionId: "q1",
      order: 1,
      title: "基礎語法與觀念檢核",
      kind: "single_choice",
      maxScore: 10,
      answerCount: 48,
      missingCount: 2,
      averageScore: 7.8,
      scoreRate: 78,
      zeroRate: 6,
      fullRate: 52,
      status: "stable",
      objectiveStats: { correctRate: 50 },
    },
    {
      questionId: "q2",
      order: 2,
      title: "申論：程序與執行緒差異",
      kind: "essay",
      maxScore: 15,
      answerCount: 47,
      missingCount: 3,
      averageScore: 7.4,
      scoreRate: 49,
      zeroRate: 6,
      fullRate: 8,
      status: "grading",
      subjectiveStats: { gradedCount: 29, pendingCount: 18, gradingRate: 62 },
    },
    {
      questionId: "q3",
      order: 3,
      title: "簡答：演算法複雜度說明",
      kind: "short_answer",
      maxScore: 10,
      answerCount: 47,
      missingCount: 3,
      averageScore: 6.3,
      scoreRate: 63,
      zeroRate: 9,
      fullRate: 24,
      status: "stable",
      subjectiveStats: { gradedCount: 47, pendingCount: 0, gradingRate: 100 },
    },
    {
      questionId: "q4",
      order: 4,
      title: "多選：資料結構特性判斷",
      kind: "multiple_choice",
      maxScore: 15,
      answerCount: 49,
      missingCount: 1,
      averageScore: 10.8,
      scoreRate: 72,
      zeroRate: 12,
      fullRate: 38,
      status: "stable",
      objectiveStats: { correctRate: 57 },
    },
    {
      questionId: "q5",
      order: 5,
      title: "案例題：Deadlock 預防策略",
      kind: "essay",
      maxScore: 15,
      answerCount: 48,
      missingCount: 2,
      averageScore: 11.7,
      scoreRate: 78,
      zeroRate: 3,
      fullRate: 36,
      status: "stable",
      subjectiveStats: { gradedCount: 48, pendingCount: 0, gradingRate: 100 },
    },
    {
      questionId: "q6",
      order: 6,
      title: "是非：資料庫交易概念",
      kind: "true_false",
      maxScore: 5,
      answerCount: 48,
      missingCount: 2,
      averageScore: 3.6,
      scoreRate: 72,
      zeroRate: 14,
      fullRate: 58,
      status: "stable",
      objectiveStats: { correctRate: 65 },
    },
    {
      questionId: "q7",
      order: 7,
      title: "申論：系統設計與取捨",
      kind: "essay",
      maxScore: 15,
      answerCount: 47,
      missingCount: 3,
      averageScore: 8.1,
      scoreRate: 54,
      zeroRate: 3,
      fullRate: 11,
      status: "grading",
      subjectiveStats: { gradedCount: 28, pendingCount: 19, gradingRate: 60 },
    },
    {
      questionId: "q8",
      order: 8,
      title: "簡答：記憶體分頁與置換",
      kind: "short_answer",
      maxScore: 10,
      answerCount: 45,
      missingCount: 5,
      averageScore: 5.1,
      scoreRate: 51,
      zeroRate: 22,
      fullRate: 16,
      status: "grading",
      subjectiveStats: { gradedCount: 33, pendingCount: 12, gradingRate: 73 },
    },
  ];

  const details: Record<string, QuestionDetailMock> = {
    q1: {
      questionId: "q1",
      kind: "single_choice",
      scoreBands: makeScoreBands([1, 2, 5, 8, 12, 20], 2),
      responses: [
        { participantId: 1, username: "amy", displayName: "Amy", score: 10, gradedAt: "2026-04-01T01:00:00.000Z", feedback: "", answer: { selected: "B" } },
        { participantId: 2, username: "ben", displayName: "ben", score: 0, gradedAt: "2026-04-01T01:01:00.000Z", feedback: "", answer: { selected: "A" } },
      ],
      optionDistribution: [
        { label: "A. 編譯器在執行期做最佳化", count: 6, percent: 13, isCorrect: false, participants: [{ participantId: 2, username: "ben", displayName: "ben" }] },
        { label: "B. 變數作用域由區塊決定", count: 24, percent: 50, isCorrect: true, participants: [{ participantId: 1, username: "amy", displayName: "Amy" }] },
        { label: "C. 遞迴一定比迴圈慢", count: 14, percent: 29, isCorrect: false, participants: [] },
        { label: "D. 陣列長度可在執行期改變", count: 2, percent: 4, isCorrect: false, participants: [] },
      ],
      omittedCount: 4,
      omittedParticipants: [
        { participantId: 101, username: "amy", displayName: "Amy" },
        { participantId: 102, username: "ben", displayName: "ben" },
        { participantId: 103, username: "carol", displayName: "Carol" },
        { participantId: 104, username: "derek", displayName: "derek" },
      ],
    },
    q2: {
      questionId: "q2",
      kind: "essay",
      scoreBands: makeScoreBands([5, 8, 14, 11, 9], 3),
      responses: [
        { participantId: 11, username: "amy", displayName: "Amy", score: 12, gradedAt: "2026-04-01T01:10:00.000Z", feedback: "", answer: { text: "程序有獨立位址空間；執行緒共享資源。" } },
        { participantId: 12, username: "ben", displayName: "ben", score: null, gradedAt: null, feedback: "", answer: { text: "待批改作答內容。" } },
      ],
      gradingProgress: { graded: 29, total: 47 },
    },
    q3: {
      questionId: "q3",
      kind: "short_answer",
      scoreBands: makeScoreBands([3, 7, 14, 16, 7], 2),
      responses: [
        { participantId: 21, username: "carol", displayName: "Carol", score: 8, gradedAt: "2026-04-01T01:20:00.000Z", feedback: "", answer: { text: "O(n log n)" } },
      ],
      gradingProgress: { graded: 47, total: 47 },
    },
    q4: {
      questionId: "q4",
      kind: "multiple_choice",
      scoreBands: makeScoreBands([6, 5, 10, 16, 12], 3),
      responses: [
        { participantId: 31, username: "eva", displayName: "Eva", score: 15, gradedAt: "2026-04-01T01:30:00.000Z", feedback: "", answer: { selected: ["A", "B", "D"] } },
      ],
      optionDistribution: [
        { label: "A. Stack 適合 DFS", count: 34, percent: 69, isCorrect: true, participants: [{ participantId: 31, username: "eva", displayName: "Eva" }] },
        { label: "B. Queue 適合 BFS", count: 33, percent: 67, isCorrect: true, participants: [{ participantId: 31, username: "eva", displayName: "Eva" }] },
        { label: "C. HashMap 保持排序", count: 21, percent: 43, isCorrect: false, participants: [] },
        { label: "D. Heap 可維護極值", count: 30, percent: 61, isCorrect: true, participants: [{ participantId: 31, username: "eva", displayName: "Eva" }] },
      ],
      omittedCount: 1,
      omittedParticipants: [
        { participantId: 105, username: "eva", displayName: "Eva" },
      ],
    },
    q5: {
      questionId: "q5",
      kind: "essay",
      scoreBands: makeScoreBands([2, 4, 10, 16, 16], 3),
      responses: [
        { participantId: 41, username: "fred", displayName: "fred", score: 14, gradedAt: "2026-04-01T01:40:00.000Z", feedback: "", answer: { text: "避免 circular wait。" } },
      ],
      gradingProgress: { graded: 48, total: 48 },
    },
    q6: {
      questionId: "q6",
      kind: "true_false",
      scoreBands: makeScoreBands([7, 0, 0, 13, 28], 1),
      responses: [
        { participantId: 51, username: "gina", displayName: "Gina", score: 5, gradedAt: "2026-04-01T01:50:00.000Z", feedback: "", answer: { selected: true } },
      ],
      optionDistribution: [
        { label: "A. True", count: 31, percent: 65, isCorrect: true, participants: [{ participantId: 51, username: "gina", displayName: "Gina" }] },
        { label: "B. False", count: 17, percent: 35, isCorrect: false, participants: [] },
      ],
      omittedCount: 2,
      omittedParticipants: [
        { participantId: 106, username: "harry", displayName: "harry" },
        { participantId: 107, username: "iris", displayName: "Iris" },
      ],
    },
    q7: {
      questionId: "q7",
      kind: "essay",
      scoreBands: makeScoreBands([2, 5, 9, 8, 4], 3),
      responses: [
        { participantId: 61, username: "jack", displayName: "jack", score: 13, gradedAt: "2026-04-01T02:00:00.000Z", feedback: "", answer: { text: "說明 CAP 與補償。" } },
      ],
      gradingProgress: { graded: 28, total: 47 },
    },
    q8: {
      questionId: "q8",
      kind: "short_answer",
      scoreBands: makeScoreBands([10, 8, 7, 11, 9], 2),
      responses: [
        { participantId: 71, username: "kate", displayName: "Kate", score: 6, gradedAt: "2026-04-01T02:10:00.000Z", feedback: "", answer: { text: "page replacement 會在 page fault 後觸發。" } },
      ],
      gradingProgress: { graded: 33, total: 45 },
    },
  };

  return {
    contest: {
      id: contest?.id ?? "mock-contest",
      name: contest?.name ?? "Spring 2026 Midterm",
      course: "CS3401 ・ Data Structures and Systems",
      contestType: "paper_exam",
      participantCount: 50,
      completedCount: 46,
      resultsPublished: contest?.resultsPublished ?? false,
    },
    summary: {
      averageScore: 71.8,
      medianScore: 74,
      maxTotalScore: 100,
      passThreshold: 60,
    },
    scoreDistribution: [
      { rangeLabel: "0-9%", count: 0 },
      { rangeLabel: "10-19%", count: 1 },
      { rangeLabel: "20-29%", count: 2 },
      { rangeLabel: "30-39%", count: 4 },
      { rangeLabel: "40-49%", count: 5 },
      { rangeLabel: "50-59%", count: 6 },
      { rangeLabel: "60-69%", count: 10 },
      { rangeLabel: "70-79%", count: 11 },
      { rangeLabel: "80-89%", count: 7 },
      { rangeLabel: "90-100%", count: 4 },
    ],
    questions,
    details,
  };
}

function createCodingDashboardMock(contest?: ContestDetail | null): DashboardMockData {
  return {
    contest: {
      id: contest?.id ?? "coding-mock",
      name: contest?.name ?? "Coding Contest",
      course: "CS3401 ・ Data Structures and Systems",
      contestType: "coding",
      participantCount: 50,
      completedCount: 44,
      resultsPublished: contest?.resultsPublished ?? false,
    },
    summary: {
      averageScore: 68.2,
      medianScore: 70,
      maxTotalScore: 100,
      passThreshold: 60,
    },
    scoreDistribution: [
      { rangeLabel: "0-9%", count: 1 },
      { rangeLabel: "10-19%", count: 2 },
      { rangeLabel: "20-29%", count: 2 },
      { rangeLabel: "30-39%", count: 4 },
      { rangeLabel: "40-49%", count: 6 },
      { rangeLabel: "50-59%", count: 7 },
      { rangeLabel: "60-69%", count: 9 },
      { rangeLabel: "70-79%", count: 10 },
      { rangeLabel: "80-89%", count: 6 },
      { rangeLabel: "90-100%", count: 3 },
    ],
    questions: [],
    details: {},
  };
}

function makeScoreBands(counts: number[], step: number) {
  return counts.map((count, index) => ({
    label: `${index * step}-${index * step + step}`,
    count,
  }));
}
