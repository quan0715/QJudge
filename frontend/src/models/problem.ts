export interface Tag {
  id: string;
  name: string;
  slug: string;
  description?: string;
  color?: string;
  created_at?: string;
}

export interface Problem {
  id: string;
  display_id?: string;
  title: string;
  difficulty: ProblemAllowedDifficulty;
  acceptance_rate: number;
  submission_count?: number;
  accepted_count?: number;
  created_by?: string;
  tags?: Tag[];
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

type ProblemAllowedLanguage = 'cpp' | 'python' | 'java' | 'javascript' | 'c';
type ProblemAllowedDifficulty = 'easy' | 'medium' | 'hard';

export type { ProblemAllowedLanguage, ProblemAllowedDifficulty };
