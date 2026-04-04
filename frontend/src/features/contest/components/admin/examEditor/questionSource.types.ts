import type { ExamQuestionType } from "@/core/entities/contest.entity";

export type QuestionSourceDragItem =
  | {
      kind: "exam_type";
      questionType: ExamQuestionType;
    }
  | {
      kind: "bank_question";
      category: "exam" | "coding";
      questionBankId: string;
      questionId: string;
      title: string;
    }
  | {
      kind: "coding_template";
      title: string;
    };

export interface QuestionSourceBankQuestion {
  questionBankId: string;
  questionId: string;
  title: string;
}

export const QUESTION_SOURCE_DRAG_MIME = "application/x-qjudge-question-source";
