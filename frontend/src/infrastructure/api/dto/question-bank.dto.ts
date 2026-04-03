import type { BankCategory, BankVisibility, BankReviewStatus, QuestionInboxSourceType } from "@/core/entities/question-bank.entity";

export interface CodingQuestionExtDto {
  translations?: Array<{
    language: string;
    title: string;
    description: string;
    input_description?: string;
    output_description?: string;
    hint?: string;
  }>;
  test_cases?: Array<{
    input_data: string;
    output_data: string;
    is_sample: boolean;
    score?: number;
    order?: number;
    is_hidden?: boolean;
  }>;
  language_configs?: Array<{
    language: string;
    template_code: string;
    is_enabled?: boolean;
    order?: number;
  }>;
  forbidden_keywords?: string[];
  required_keywords?: string[];
}

export interface BankQuestionDto {
  id: number | string;
  bank_item_id?: number | string;
  adapter_question_id?: number | string | null;
  bank_id?: number | string;
  question_type: "coding" | "exam";
  title: string;
  prompt?: string;
  options?: any[];
  correct_answer?: any;
  score?: number;
  order?: number;
  difficulty?: string;
  time_limit?: number;
  memory_limit?: number;
  metadata?: Record<string, any>;
  source_question_id?: number | string | null;
  source_bank_id?: number | string | null;
  source_bank_name?: string | null;
  contest_usages?: Array<{ contest_id: number | string; contest_name: string }>;
  coding_ext?: CodingQuestionExtDto;
  created_at?: string;
  updated_at?: string;
}

export interface QuestionBankDto {
  id: number | string;
  name: string;
  description?: string;
  icon?: string;
  cover_url?: string;
  category: BankCategory;
  visibility: BankVisibility;
  verified?: boolean;
  review_status: BankReviewStatus;
  review_note?: string;
  submitted_at?: string;
  reviewed_at?: string;
  reviewed_by_username?: string;
  owner_username?: string;
  question_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface QuestionInboxItemDto {
  source_type: QuestionInboxSourceType;
  source_id: string;
  title: string;
  contest_id?: number | string;
  contest_name?: string;
  question_type?: string;
  score?: number;
  updated_at?: string;
}

export interface QuestionInboxSummaryDto {
  coding?: QuestionInboxItemDto[];
  exam?: QuestionInboxItemDto[];
  counts?: {
    coding: number;
    exam: number;
  };
}
