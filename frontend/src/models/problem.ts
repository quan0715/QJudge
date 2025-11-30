export interface Problem {
  id: string;
  display_id?: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  acceptance_rate: number;
  submission_count?: number;
  accepted_count?: number;
  created_by?: string;
  // New MVP fields
  is_practice_visible?: boolean;
  created_in_contest?: {
    id: string;
    title: string;
    start_time: string;
    end_time: string;
  } | null;
  is_solved?: boolean;
  // Deprecated fields (keep for backwards compatibility)
  // is_contest_only removed
}
