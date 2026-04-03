import type {
  Classroom,
  ClassroomDetail,
  ClassroomMember,
  ClassroomAnnouncement,
  ClassroomLabSummary,
} from "@/core/entities/classroom.entity";
import type {
  ClassroomDto,
  ClassroomDetailDto,
  ClassroomMemberDto,
  ClassroomAnnouncementDto,
  ClassroomLabSummaryDto,
} from "../api/dto/classroom.dto";

export function mapClassroomDto(dto: ClassroomDto): Classroom {
  return {
    id: dto.id.toString(),
    name: dto.name,
    description: dto.description || "",
    ownerUsername: dto.owner_username || "",
    memberCount: dto.member_count || 0,
    isArchived: !!dto.is_archived,
    currentUserRole: dto.current_user_role || null,
    icon: dto.icon || "",
    coverUrl: dto.cover_url || "",
    createdAt: dto.created_at,
  };
}

export function mapClassroomMemberDto(dto: ClassroomMemberDto): ClassroomMember {
  return {
    userId: dto.user_id,
    username: dto.username,
    email: dto.email,
    avatarUrl: dto.avatar_url,
    role: dto.role,
    joinedAt: dto.joined_at,
  };
}

export function mapClassroomAnnouncementDto(dto: ClassroomAnnouncementDto): ClassroomAnnouncement {
  return {
    id: dto.id.toString(),
    title: dto.title,
    content: dto.content,
    isPinned: !!dto.is_pinned,
    createdByUsername: dto.created_by_username || null,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

export function mapClassroomLabSummaryDto(dto: ClassroomLabSummaryDto): ClassroomLabSummary {
  return {
    labId: dto.lab_id.toString(),
    name: dto.name,
    description: dto.description || "",
    status: dto.status || "draft",
    visibility: dto.visibility || "public",
    requiresPassword: !!dto.requires_password,
    contestType: dto.contest_type,
    deliveryMode: dto.delivery_mode,
    startTime: dto.start_time,
    endTime: dto.end_time,
    resultsPublished: !!dto.results_published,
    assignmentState: dto.assignment_state as any || null,
    acceptedAt: dto.accepted_at,
    submittedAt: dto.submitted_at,
    participantCount: dto.participant_count || 0,
    assignmentCounts: dto.assignment_counts || { unaccepted: 0, accepted: 0, submitted: 0 },
    boundAt: dto.bound_at,
  };
}

export function mapClassroomDetailDto(dto: ClassroomDetailDto): ClassroomDetail {
  const base = mapClassroomDto(dto);
  return {
    ...base,
    inviteCode: dto.invite_code || null,
    inviteCodeEnabled: !!dto.invite_code_enabled,
    members: Array.isArray(dto.members) ? dto.members.map(mapClassroomMemberDto) : [],
    labs: Array.isArray(dto.labs) ? dto.labs.map(mapClassroomLabSummaryDto) : [],
    contests: [], // Backward compat
    admins: Array.isArray(dto.admins) ? dto.admins : [],
    announcements: Array.isArray(dto.announcements) ? dto.announcements.map(mapClassroomAnnouncementDto) : [],
    updatedAt: dto.updated_at,
  };
}
