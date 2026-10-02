import type { ExamQuestionAnswerFormat, ExamQuestionType } from "./contest.entity";

export interface GradeAppeal {
  id: number;
  exam_answer: number;
  question_id: string;
  question_order: number;
  question_prompt: string;
  student_id: number;
  student_username: string;
  status: "open" | "closed";
  created_at: string;
  closed_at: string | null;
  closed_by: number | null;
  last_message_at: string;
}

export interface GradeAppealDetail extends GradeAppeal {
  messages: Array<{
    id: number;
    author_id: number | null;
    author_username: string;
    content: string;
    created_at: string;
  }>;
  current_score: number | null;
  current_max_score: number;
  answer_format: ExamQuestionAnswerFormat;
  answer: {
    answer: Record<string, unknown>;
    question_type: ExamQuestionType;
    question_options: string[];
    feedback: string;
  };
}
