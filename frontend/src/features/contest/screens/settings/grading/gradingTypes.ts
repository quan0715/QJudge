/** Shared types for the exam grading system. */

export type QuestionType =
  | "true_false"
  | "single_choice"
  | "multiple_choice"
  | "short_answer"
  | "essay";

/** Whether a question type requires manual grading. */
export const isSubjectiveType = (t: QuestionType): boolean =>
  t === "short_answer" || t === "essay";

export const questionTypeLabel: Record<QuestionType, string> = {
  true_false: "是非題",
  single_choice: "單選題",
  multiple_choice: "多選題",
  short_answer: "簡答題",
  essay: "申論題",
};

/** A single student answer row used across all tabs. */
export interface GradingAnswerRow {
  id: string;
  studentId: string;
  studentUsername: string;
  studentNickname: string;
  questionId: string;
  questionIndex: number; // 1-based
  questionPrompt: string;
  questionType: QuestionType;
  questionOptions: string[];
  maxScore: number;
  answerContent: Record<string, unknown>;
  /** null = not graded */
  score: number | null;
  feedback: string;
  gradedBy: string | null;
  gradedAt: string | null;
  isAutoGraded: boolean;
  /** Correct answer for objective questions; null for subjective. */
  correctAnswer: unknown;
  /** True if this is a placeholder row for a student who didn't submit. */
  isAbsent?: boolean;
}

/** Per-question progress stats. */
export interface QuestionProgress {
  questionId: string;
  questionIndex: number;
  questionType: QuestionType;
  prompt: string;
  maxScore: number;
  totalAnswers: number;
  gradedCount: number;
  /** 0–100 */
  progressPercent: number;
  isObjective: boolean;
}

/** Global stats for the overview. */
export interface GlobalStats {
  totalStudents: number;
  totalParticipants: number;
  totalQuestions: number;
  totalAnswers: number;
  gradedAnswers: number;
  ungradedAnswers: number;
  /** Only counting subjective questions */
  subjectiveTotal: number;
  subjectiveGraded: number;
}

/** Filter state for answer tables. */
export type GradingFilter = "all" | "ungraded" | "graded";

export const gradingFilterOptions: { id: GradingFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "ungraded", label: "未批改" },
  { id: "graded", label: "已批改" },
];
