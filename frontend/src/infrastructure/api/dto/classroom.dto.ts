import type { ClassroomScopeRole } from "@/core/entities/classroom.entity";
import type { ContestType } from "@/core/entities/contest.entity";

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

export interface BoundContestDto {
  contest_id: string;
  contest_name: string;
  contest_description: string;
  contest_status: "draft" | "published";
  attendance_check_enabled?: boolean;
  contest_type: "coding" | "paper_exam";
  contest_start_time: string;
  contest_end_time: string;
  contest_owner_username: string;
  results_published?: boolean;
  participant_count: number;
  bound_at: string;
}

export interface ClassroomDetailDto extends ClassroomDto {
  invite_code?: string | null;
  invite_code_enabled?: boolean;
  members?: ClassroomMemberDto[];
  contests?: BoundContestDto[];
  announcements?: ClassroomAnnouncementDto[];
  updated_at: string;
}

export interface ClassroomGradebookContestDto {
  id: string;
  name: string;
  contest_type: ContestType;
  start_time: string | null;
  max_score: number;
}

export interface ClassroomGradebookStudentDto {
  user_id: number;
  username: string;
  display_name: string;
  scores: Record<string, number | null>;
}

export interface ClassroomGradebookDto {
  contests: ClassroomGradebookContestDto[];
  students: ClassroomGradebookStudentDto[];
}
