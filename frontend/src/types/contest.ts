// Contest System Type Definitions

export type UserRole = 'student' | 'teacher' | 'admin';

export type ContestStatus = 'inactive' | 'active';

export type ContestVisibility = 'public' | 'private';

export type ExamEventType = 'tab_hidden' | 'window_blur' | 'exit_fullscreen';

export type SubmissionStatus = 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'NS';

/**
 * Permissions for contest operations
 */
export interface ContestPermissions {
  can_switch_view: boolean;
  can_edit_contest: boolean;
  can_toggle_status: boolean;
  can_publish_problems: boolean;
  can_view_all_submissions: boolean;
  can_view_full_scoreboard: boolean;
  can_manage_clarifications: boolean;
}

/**
 * Problem summary in contest context
 */
export interface ContestProblemSummary {
  id: string;  // ContestProblem ID
  problem_id: string;  // Actual Problem ID
  label: string;  // A, B, C, etc.
  title: string;
  user_status?: SubmissionStatus;
  score?: number;
}

/**
 * Full contest detail from backend
 */
export interface ContestDetail {
  id: string;
  name: string;
  description: string;
  rules: string;
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
  has_finished_exam: boolean;
  is_registered?: boolean; // Backwards compatibility
  
  // Permissions
  permissions: ContestPermissions;
  
  // Problems in contest
  problems: ContestProblemSummary[];
  
  // Additional settings
  is_public?: boolean;
  allow_multiple_joins?: boolean;
  ban_tab_switching?: boolean;
  max_cheat_warnings?: number;
  allow_auto_unlock?: boolean;
  auto_unlock_minutes?: number;
}

// ... (Scoreboard types omitted)

/**
 * Contest update request
 */
export interface ContestUpdateRequest {
  name?: string;
  description?: string;
  rules?: string;
  start_time?: string;
  end_time?: string;
  status?: ContestStatus;
  visibility?: ContestVisibility;
  password?: string;
  exam_mode_enabled?: boolean;
  scoreboard_visible_during_contest?: boolean;
  allow_view_results?: boolean;
  allow_multiple_joins?: boolean;
  ban_tab_switching?: boolean;
  max_cheat_warnings?: number;
  allow_auto_unlock?: boolean;
  auto_unlock_minutes?: number;
}

/**
 * Scoreboard problem cell data
 */
export interface ScoreboardProblemCell {
  status: SubmissionStatus;
  attempts: number;
  time: number | null;  // Minutes from contest start to AC
}

/**
 * Scoreboard row for one participant
 */
export interface ScoreboardRow {
  user_id: string;
  display_name: string;
  solved_count: number;
  penalty: number;
  problems: Record<string, ScoreboardProblemCell>;  // Key is problem label (A, B, C...)
}

/**
 * Full scoreboard data
 */
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

/**
 * Exam event tracking
 */
export interface ExamEvent {
  id: string;
  user_id: string;
  user_name: string;
  event_type: ExamEventType;
  timestamp: string;
}

/**
 * Exam event statistics per user
 */
export interface ExamEventStats {
  user_id: string;
  user_name: string;
  tab_hidden_count: number;
  window_blur_count: number;
  exit_fullscreen_count: number;
  total_violations: number;
}

/**
 * Clarification/Question in contest
 */
export interface Clarification {
  id: string;
  contest_id: string;
  student_id: string;
  student_name: string;
  problem_id?: string;  // null for general questions
  problem_title?: string;
  title: string;
  content: string;
  answer?: string;
  answered_by?: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Contest registration request
 */
export interface ContestRegistrationRequest {
  password?: string;
}

/**
 * Contest creation request (minimal)
 */
export interface ContestCreateRequest {
  name: string;
  visibility: ContestVisibility;
  password?: string;
}


/**
 * Exam mode state
 */
export interface ExamModeState {
  isActive: boolean;
  isLocked: boolean;
  lockReason?: string;
  startTime?: Date;
}
