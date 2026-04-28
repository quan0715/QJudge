import type { UserRole } from "@/core/entities/user.entity";
import type { SubmissionStatus } from "@/core/entities/submission.entity";
import type {
  ContestStatus,
  ContestVisibility,
  ContestType,
  ContestDeliveryMode,
  ExamStatusType,
} from "@/core/entities/contest.entity";

export interface ContestProblemSummaryDto {
  id?: number | string;
  problem_id?: number | string;
  label?: string;
  title?: string;
  order?: number;
  score?: number;
  max_score?: number;
  source_bank?: {
    id?: number | string;
    name?: string;
  } | null;
  source_question_id?: number | string | null;
  source_mode?: "manual" | "json" | "copy" | "reference";
  user_status?: SubmissionStatus;
  difficulty?: string;
}

export interface ExamQuestionDto {
  id?: number | string;
  contest?: number | string;
  question_type?: string;
  prompt?: string;
  options?: unknown[];
  correct_answer?: unknown;
  explanation?: string;
  score?: number;
  order?: number;
  source_bank?: {
    id?: number | string;
    name?: string;
  } | null;
  source_question_id?: number | string | null;
  source_mode?: "manual" | "json" | "copy" | "reference";
  created_at?: string;
  updated_at?: string;
}

export interface ContestDto {
  id: number | string;
  name?: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  status?: ContestStatus;
  visibility?: ContestVisibility;
  requires_password?: boolean;
  delivery_mode?: ContestDeliveryMode;
  counts_toward_grade?: boolean;
  password?: string;
  has_joined?: boolean;
  is_registered?: boolean;
  current_user_role?: UserRole;
  participant_count?: number;
}

export interface AnticheatDevicePolicyDto {
  desktop?: {
    enabled?: boolean;
    sources?: {
      screen_share?: { enabled?: boolean; capture_interval_seconds?: number };
      webcam?: { enabled?: boolean; capture_interval_seconds?: number };
    };
    detectors?: {
      pwa_mode?: boolean;
      fullscreen?: boolean;
      focus?: boolean;
      tab_visibility?: boolean;
      multi_display?: boolean;
      mouse_leave?: boolean;
      viewport_integrity?: boolean;
    };
  };
  tablet?: {
    enabled?: boolean;
    sources?: {
      screen_share?: { enabled?: boolean; capture_interval_seconds?: number };
      webcam?: { enabled?: boolean; capture_interval_seconds?: number };
    };
    detectors?: {
      pwa_mode?: boolean;
      fullscreen?: boolean;
      focus?: boolean;
      tab_visibility?: boolean;
      multi_display?: boolean;
      mouse_leave?: boolean;
      viewport_integrity?: boolean;
    };
  };
}

export interface ContestDetailDto extends ContestDto {
  rules?: string;
  rule?: string; // Legacy alias
  owner_username?: string;
  is_classroom_bound?: boolean;
  bound_classroom_id?: number | string | null;
  contest_type?: ContestType;
  cheat_detection_enabled?: boolean;
  anticheat_device_policy?: AnticheatDevicePolicyDto;
  warning_timeout_seconds?: number;
  screen_share_recovery_grace_ms?: number;
  scoreboard_visible_during_contest?: boolean;
  anonymous_mode_enabled?: boolean;
  allow_multiple_joins?: boolean;
  max_cheat_warnings?: number;
  allow_auto_unlock?: boolean;
  auto_unlock_minutes?: number;
  results_published?: boolean;
  question_edit_locked?: boolean;
  question_edit_locked_at?: string | null;
  question_edit_lock_trigger?: "coding_submission" | "exam_answer" | null;
  is_exam_questions_frozen?: boolean;
  exam_questions_count?: number;
  my_nickname?: string;
  has_started?: boolean;
  started_at?: string;
  left_at?: string;
  locked_at?: string;
  lock_reason?: string;
  submit_reason?: string;
  exam_status?: ExamStatusType;
  assignment_state?: string | null;
  accepted_at?: string | null;
  submitted_at?: string | null;
  auto_unlock_at?: string;
  is_exam_monitored?: boolean;
  requires_fullscreen?: boolean;
  can_submit_exam?: boolean;
  permissions?: {
    can_switch_view?: boolean;
    can_edit_contest?: boolean;
    can_toggle_status?: boolean;
    can_delete_contest?: boolean;
    can_publish_problems?: boolean;
    can_view_all_submissions?: boolean;
    can_view_full_scoreboard?: boolean;
    can_manage_clarifications?: boolean;
  };
  problems?: ContestProblemSummaryDto[];
  admins?: Array<{ id?: number | string; username?: string }>;
}

export interface ContestOverviewMetricsDto {
  online_now?: number;
  online_active_sessions?: number;
  exam?: {
    status?: string;
    contest_type?: string;
  };
  time_progress?: {
    total_seconds?: number;
    elapsed_seconds?: number;
    remaining_seconds?: number;
    progress_percent?: number;
    is_started?: boolean;
    is_ended?: boolean;
  };
}

export interface ContestParticipantDto {
  user_id?: number | string;
  username?: string;
  user?: {
    email?: string;
    role?: string;
    auth_provider?: string;
    profile?: {
      display_name?: string;
    };
  };
  user_display_name?: string;
  account_role?: string;
  auth_provider?: string;
  connection_status?: "offline" | "online" | "live";
  last_heartbeat_at?: string | null;
  live_monitoring_online?: boolean;
  live_monitoring_sources?: Array<"screen_share" | "webcam">;
  score?: number;
  total_score?: number;
  rank?: number;
  joined_at?: string;
  exam_status?: ExamStatusType;
  lock_reason?: string;
  violation_count?: number;
  submit_reason?: string;
  nickname?: string;
  display_name?: string;
  started_at?: string;
  left_at?: string;
  locked_at?: string;
}

export interface ParticipantDashboardStatusDto {
  code?: string;
  label?: string;
  color?: string;
}

export interface ParticipantTimelineItemDto {
  id?: number | string;
  source?: "exam_event" | "activity";
  event_type?: string;
  timestamp?: string;
  message?: string;
  metadata?: any;
}

export interface ParticipantPaperReportRowDto {
  question_id?: number | string;
  index?: number;
  question_type?: string;
  status?: ParticipantDashboardStatusDto;
  score?: number | null;
  max_score?: number;
}

export interface ParticipantCodingProblemRowDto {
  problem_id?: number | string;
  label?: string;
  title?: string;
  difficulty?: string | null;
  status?: string | null;
  score?: number;
  max_score?: number;
  tries?: number;
  time?: number | null;
}

export interface EventFeedItemDto {
  incident_key?: string;
  event_id?: string | number;
  event_type?: string;
  priority?: number;
  category?: string;
  penalized?: boolean;
  first_at?: string;
  last_at?: string;
  count?: number;
  evidence_count?: number;
  summary?: string;
  source?: string;
  user_name?: string;
  user_id?: number | string;
  metadata?: any;
}

export interface ParticipantDashboardDto {
  contest_type?: string;
  participant?: ContestParticipantDto;
  overview?: {
    total_score?: number;
    max_score?: number;
    solved?: number;
    total_problems?: number;
    rank?: number | null;
    total_participants?: number;
    effective_submissions?: number;
    accepted_submissions?: number;
    accepted_rate?: number;
    correct_rate?: number;
    graded_count?: number;
    total_questions?: number;
  };
  report?: {
    overview_rows?: ParticipantPaperReportRowDto[];
    question_details?: any[];
    problem_grid?: ParticipantCodingProblemRowDto[];
    problem_details?: any[];
    trend?: {
      submission_timeline?: any[];
      cumulative_progress?: any[];
      status_counts?: Record<string, number>;
    };
  };
  timeline?: ParticipantTimelineItemDto[];
  event_feed?: EventFeedItemDto[];
  actions?: {
    can_download_report?: boolean;
    can_edit_status?: boolean;
    can_remove_participant?: boolean;
    can_unlock?: boolean;
    can_reopen_exam?: boolean;
    can_view_evidence?: boolean;
    can_open_grading?: boolean;
  };
}

export interface ScoreboardRowDto {
  rank?: number;
  user?: { id?: number | string; username?: string };
  user_id?: number | string;
  display_name?: string;
  nickname?: string;
  solved?: number;
  solved_count?: number;
  total_score?: number;
  total_score_val?: number;
  time?: number;
  penalty?: number;
  problems?: Record<string, any>;
}

export interface ScoreboardDto {
  contest?: { id?: number | string; name?: string };
  problems?: any[];
  standings?: ScoreboardRowDto[];
  rows?: ScoreboardRowDto[];
}
