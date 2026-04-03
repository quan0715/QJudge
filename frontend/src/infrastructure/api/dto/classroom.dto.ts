import type { ClassroomScopeRole } from "@/core/entities/classroom.entity";

export interface ClassroomDto {
  uuid: string;
  name: string;
  description?: string;
  owner_username?: string;
  member_count?: number;
  is_archived?: boolean;
  current_user_role?: ClassroomScopeRole | null;
  icon?: string;
  cover_url?: string;
  created_at: string;
}

export interface ClassroomMemberDto {
  user_id: number;
  username: string;
  email: string;
  avatar_url?: string;
  role: "student" | "ta";
  joined_at: string;
}

export interface ClassroomAnnouncementDto {
  id: number | string;
  title: string;
  content: string;
  is_pinned?: boolean;
  created_by_username?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClassroomLabSummaryDto {
  lab_id: string;
  name: string;
  description?: string;
  status: "draft" | "published" | "archived";
  visibility: "public" | "private";
  requires_password?: boolean;
  contest_type: "coding" | "paper_exam";
  delivery_mode: "practice" | "exam";
  start_time: string;
  end_time: string;
  results_published?: boolean;
  assignment_state?: string | null;
  accepted_at?: string | null;
  submitted_at?: string | null;
  participant_count?: number;
  assignment_counts?: {
    unaccepted: number;
    accepted: number;
    submitted: number;
  };
  bound_at: string;
}

export interface BoundContestDto {
  contest_id: string;
  contest_name: string;
  contest_description: string;
  contest_status: "draft" | "published" | "archived";
  contest_visibility: "public" | "private";
  requires_password?: boolean;
  contest_type: "coding" | "paper_exam";
  delivery_mode: "practice" | "exam";
  contest_start_time: string;
  contest_end_time: string;
  contest_owner_username: string;
  participant_count: number;
  bound_at: string;
}

export interface ClassroomDetailDto extends ClassroomDto {
  invite_code?: string | null;
  invite_code_enabled?: boolean;
  members?: ClassroomMemberDto[];
  contests?: BoundContestDto[];
  labs?: ClassroomLabSummaryDto[];
  admins?: Array<{ id: number; username: string }>;
  announcements?: ClassroomAnnouncementDto[];
  updated_at: string;
}
