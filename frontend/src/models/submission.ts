export interface Submission {
  id: string;
  problem: string;
  user: string;
  language: string;
  code: string;
  status: string;
  execution_time?: number;
  memory_usage?: number;
  created_at: string;
  contest?: string;
  is_test?: boolean;
}
