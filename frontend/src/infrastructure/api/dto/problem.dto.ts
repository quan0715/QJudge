import type { Difficulty } from "@/core/entities/problem.entity";

export interface TagDto {
  id: number | string;
  name: string;
  slug: string;
  description?: string;
  color?: string;
  created_at?: string;
}

export interface LanguageConfigDto {
  language: string;
  template_code: string;
  is_enabled: boolean;
  order?: number;
}

export interface TestCaseDto {
  input_data?: string;
  input?: string; // Compatibility
  output_data?: string;
  output?: string; // Compatibility
  is_sample: boolean;
  explanation?: string;
  score?: number;
  order?: number;
  is_hidden?: boolean;
}

export interface ProblemDto {
  id: number | string;
  title: string;
  difficulty: Difficulty;
  acceptance_rate: number;
  submission_count: number;
  accepted_count: number;
  wa_count?: number;
  tle_count?: number;
  mle_count?: number;
  re_count?: number;
  ce_count?: number;
  created_by?: string;
  tags: TagDto[];
  is_solved?: boolean;
  created_at?: string;
}

export interface ProblemDetailDto extends ProblemDto {
  description: string;
  input_description?: string;
  output_description?: string;
  hint?: string;
  time_limit?: number;
  memory_limit?: number;
  samples?: Array<{
    input: string;
    output: string;
    explanation?: string;
  }>;
  test_cases?: TestCaseDto[];
  language_configs?: LanguageConfigDto[];
  forbidden_keywords?: string[];
  required_keywords?: string[];
}
