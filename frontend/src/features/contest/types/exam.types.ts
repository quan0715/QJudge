import type {
  ContestProblemSummary,
  ExamQuestion,
} from "@/core/entities/contest.entity";

/** 統一的考試項目：程式題 or 紙筆題 */
export type ExamItem =
  | { kind: "coding"; data: ContestProblemSummary }
  | { kind: "question"; data: ExamQuestion };

/** 學生對某題的作答內容 */
export type ExamAnswer = {
  itemId: string;
  value: unknown; // boolean | string | number[] | string
};

/** 顯示模式 */
export type ExamViewMode = "single" | "all";
