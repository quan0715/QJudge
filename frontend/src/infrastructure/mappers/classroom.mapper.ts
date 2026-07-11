import type {
  Classroom,
  ClassroomDetail,
  ClassroomMember,
  ClassroomAnnouncement,
  BoundContest,
} from "@/core/entities/classroom.entity";
import type {
  ClassroomDto,
  ClassroomDetailDto,
  ClassroomMemberDto,
  ClassroomAnnouncementDto,
  BoundContestDto,
} from "@/infrastructure/api/dto/classroom.dto";

export function mapClassroomDto(dto: ClassroomDto): Classroom {
  return {
    id: dto.uuid,
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

export function mapBoundContestDto(dto: BoundContestDto): BoundContest {
  return {
    contestId: dto.contest_id,
    contestName: dto.contest_name,
    contestDescription: dto.contest_description,
    contestStatus: dto.contest_status,
    contestVisibility: dto.contest_visibility,
    attendanceCheckEnabled: !!dto.attendance_check_enabled,
    contestType: dto.contest_type,
    contestStartTime: dto.contest_start_time,
    contestEndTime: dto.contest_end_time,
    contestOwnerUsername: dto.contest_owner_username,
    resultsPublished: !!dto.results_published,
    participantCount: dto.participant_count || 0,
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
    contests: Array.isArray(dto.contests) ? dto.contests.map(mapBoundContestDto) : [],
    admins: Array.isArray(dto.admins) ? dto.admins : [],
    announcements: Array.isArray(dto.announcements) ? dto.announcements.map(mapClassroomAnnouncementDto) : [],
    updatedAt: dto.updated_at,
  };
}
