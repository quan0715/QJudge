import type { ExamQuestionAnswerFormat, ExamQuestionType } from "./contest.entity";

export interface GradeAppeal {
  id: number;
  exam_answer: number;
  question_id: string;
  question_order: number;
  question_label?: string;
  question_prompt: string;
  student_id: number;
  student_username: string;
  student_avatar_url?: string | null;
  status: "open" | "closed";
  waiting_for?: "staff" | "student" | null;
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
    author_avatar_url?: string | null;
    content: string;
    created_at: string;
  }>;
  current_score: number | null;
  current_max_score: number;
  answer_format: ExamQuestionAnswerFormat;
  answer: {
    question_prompt?: string;
    answer: Record<string, unknown>;
    question_type: ExamQuestionType;
    question_options: string[];
    feedback: string;
  };
}
