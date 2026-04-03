import type { SubmissionStatus } from "@/core/entities/submission.entity";

export interface TestCaseResultDto {
  id: number | string;
  test_case?: number | string;
  status: string;
  exec_time?: number;
  memory_usage?: number;
  is_hidden?: boolean;
  error_message?: string;
  input?: string;
  output?: string;
  expected_output?: string;
}

export interface SubmissionDto {
  id: number | string;
  problem_id?: number | string;
  problem_title?: string;
  user_id?: number | string;
  user_username?: string;
  username?: string;
  language: string;
  status: string;
  score?: number;
  exec_time?: number;
  memory_usage?: number;
  created_at: string;
  contest_id?: number | string;
}

export interface SubmissionDetailDto extends SubmissionDto {
  code: string;
  error_message?: string;
  user?: {
    id: number | string;
    username: string;
    email?: string;
    profile?: {
      display_name?: string;
    };
  };
  problem?: {
    id: number | string;
    title: string;
    slug?: string;
  };
  results?: TestCaseResultDto[];
  total_test_cases?: number;
}
