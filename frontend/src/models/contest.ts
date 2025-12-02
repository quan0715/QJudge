export type UserRole = 'student' | 'teacher' | 'admin';
export type ContestStatus = 'inactive' | 'active';
export type ContestVisibility = 'public' | 'private';
export type ExamEventType = 'tab_hidden' | 'window_blur' | 'exit_fullscreen';
export type SubmissionStatus = 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'NS';

export interface ContestPermissions {
  can_switch_view: boolean;
  can_edit_contest: boolean;
  can_toggle_status: boolean;
  can_publish_problems: boolean;
  can_view_all_submissions: boolean;
  can_view_full_scoreboard: boolean;
  can_manage_clarifications: boolean;
}

export interface ContestProblemSummary {
  id: string;  // ContestProblem ID
  problem_id: string;  // Actual Problem ID
  label: string;  // A, B, C, etc.
  title: string;
  user_status?: SubmissionStatus;
  score?: number;
  difficulty?: string;
}

export interface ContestDetail {
  id: string;
  name: string;
  description: string;
  rules?: string;
  start_time: string;
  end_time: string;
  status: ContestStatus;
  visibility: ContestVisibility;
  password?: string;
  
  // Exam mode settings
  exam_mode_enabled: boolean;
  scoreboard_visible_during_contest: boolean;
  
  // User-specific state
  current_user_role: UserRole;
  has_joined: boolean;
  has_started?: boolean;
  started_at?: string;
  has_finished_exam: boolean;
  is_locked?: boolean;
  lock_reason?: string;
  is_registered?: boolean; // Backwards compatibility
  
  // Permissions
  permissions: ContestPermissions;
  
  // Problems in contest
  problems: ContestProblemSummary[];
  
  // Additional settings
  allow_view_results?: boolean;
  allow_multiple_joins?: boolean;
  ban_tab_switching?: boolean;
  max_cheat_warnings?: number;
  participant_count?: number;
}

export interface ScoreboardProblemCell {
  status: SubmissionStatus;
  attempts: number;
  time: number | null;  // Minutes from contest start to AC
}

export interface ScoreboardRow {
  user_id: string;
  display_name: string;
  solved_count: number;
  penalty: number;
  problems: Record<string, ScoreboardProblemCell>;  // Key is problem label (A, B, C...)
}

export interface ScoreboardData {
  contest: {
    id: string;
    name: string;
  };
  problems: Array<{
    label: string;
    problem_id: string;
    score?: number;
  }>;
  rows: ScoreboardRow[];
}

export interface ExamEvent {
  id: string;
  user_id: string;
  user_name: string;
  event_type: ExamEventType;
  timestamp: string;
}

export interface ExamEventStats {
  user_id: string;
  user_name: string;
  tab_hidden_count: number;
  window_blur_count: number;
  exit_fullscreen_count: number;
  total_violations: number;
}

export interface Clarification {
  id: number;
  contest: number;
  author: number;
  author_username: string;
  problem?: number;  // null for general questions
  problem_title?: string;
  question: string;
  answer?: string;
  answered_by?: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContestRegistrationRequest {
  password?: string;
}

export interface ContestCreateRequest {
  name: string;
  visibility: ContestVisibility;
  password?: string;
  description?: string;
  rules?: string;
  start_time?: string;
  end_time?: string;
}

export interface ContestUpdateRequest {
  name?: string;
  description?: string;
  rules?: string;
  start_time?: string;
  end_time?: string;
  visibility?: ContestVisibility;
  password?: string;
  exam_mode_enabled?: boolean;
  scoreboard_visible_during_contest?: boolean;
  allow_view_results?: boolean;
  allow_multiple_joins?: boolean;
  ban_tab_switching?: boolean;
  max_cheat_warnings?: number;
}

export interface ExamModeState {
  isActive: boolean;
  isLocked: boolean;
  lockReason?: string;
  startTime?: Date;
  violationCount?: number;
  maxWarnings?: number;
}

export interface ContestQuestion {
  id: string;
  contest_id: string;
  student_id: string;
  student_name: string;
  title: string;
  content: string;
  answer?: string;
  answered_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Contest {
  id: string;
  name: string;
  description: string;
  rules?: string;
  start_time: string;
  end_time: string;
  status: 'active' | 'inactive';
  current_user_role?: 'student' | 'teacher' | 'admin';
  permissions?: {
    can_edit?: boolean;
    can_delete?: boolean;
    can_end_contest?: boolean;
    can_manage_problems?: boolean;
    can_view_all_submissions?: boolean;
    can_export_scores?: boolean;
  };
  visibility: ContestVisibility;
  password?: string;
  is_registered: boolean;
  has_left: boolean;
  is_ended?: boolean;  // New MVP field
  allow_view_results?: boolean;
  allow_multiple_joins?: boolean;
  ban_tab_switching?: boolean;
  is_archived?: boolean;
  max_cheat_warnings?: number;
}

export interface ContestParticipant {
  user_id: number;
  username: string;
  user: any;
  score: number;
  rank?: number;
  joined_at: string;
  has_finished_exam: boolean;
  is_locked: boolean;
  lock_reason: string;
  violation_count: number;
}
