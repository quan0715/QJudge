import type {
  Classroom,
  ClassroomDetail,
  ClassroomMember,
  BoundContest,
  ClassroomLabSummary,
  ClassroomAnnouncement,
} from "@/core/entities/classroom.entity";

export function mapClassroomDto(dto: any): Classroom {
  return {
    id: dto.uuid?.toString() || dto.id?.toString() || "",
    name: dto.name || "",
    description: dto.description || "",
    ownerUsername: dto.owner_username || "",
    memberCount: dto.member_count ?? 0,
    isArchived: !!dto.is_archived,
    currentUserRole: dto.current_user_role ?? null,
    icon: dto.icon || "",
    coverUrl: dto.cover_url || "",
    createdAt: dto.created_at || "",
  };
}

export function mapClassroomMemberDto(dto: any): ClassroomMember {
  return {
    userId: dto.user_id,
    username: dto.username || "",
    email: dto.email || "",
    avatarUrl: dto.avatar_url || "",
    role: dto.role || "student",
    joinedAt: dto.joined_at || "",
  };
}

export function mapBoundContestDto(dto: any): BoundContest {
  return {
    contestId: dto.contest_id?.toString() || "",
    contestName: dto.contest_name || "",
    contestDescription: dto.contest_description || "",
    contestStatus: dto.contest_status || "draft",
    contestVisibility: dto.contest_visibility || "public",
    contestType: dto.contest_type || "coding",
    deliveryMode: dto.delivery_mode || "exam",
    contestStartTime: dto.contest_start_time || dto.bound_at || "",
    contestEndTime: dto.contest_end_time || dto.bound_at || "",
    contestOwnerUsername: dto.contest_owner_username || "",
    participantCount: Number(dto.participant_count ?? 0),
    boundAt: dto.bound_at || "",
  };
}

export function mapClassroomAnnouncementDto(dto: any): ClassroomAnnouncement {
  return {
    id: dto.id?.toString() || "",
    title: dto.title || "",
    content: dto.content || "",
    isPinned: !!dto.is_pinned,
    createdByUsername: dto.created_by_username ?? null,
    createdAt: dto.created_at || "",
    updatedAt: dto.updated_at || "",
  };
}

export function mapClassroomLabSummaryDto(dto: any): ClassroomLabSummary {
  return {
    labId: dto.lab_id?.toString() || "",
    name: dto.name || "",
    description: dto.description || "",
    status: dto.status || "draft",
    visibility: dto.visibility || "private",
    contestType: dto.contest_type || "coding",
    deliveryMode: dto.delivery_mode || "practice",
    startTime: dto.start_time || "",
    endTime: dto.end_time || "",
    resultsPublished: !!dto.results_published,
    assignmentState: dto.assignment_state ?? null,
    acceptedAt: dto.accepted_at ?? null,
    submittedAt: dto.submitted_at ?? null,
    participantCount: Number(dto.participant_count ?? 0),
    assignmentCounts: {
      unaccepted: Number(dto.assignment_counts?.unaccepted ?? 0),
      accepted: Number(dto.assignment_counts?.accepted ?? 0),
      submitted: Number(dto.assignment_counts?.submitted ?? 0),
    },
    boundAt: dto.bound_at || "",
  };
}

export function mapClassroomDetailDto(dto: any): ClassroomDetail {
  const base = mapClassroomDto(dto);
  return {
    ...base,
    inviteCode: dto.invite_code ?? null,
    inviteCodeEnabled: !!dto.invite_code_enabled,
    members: Array.isArray(dto.members)
      ? dto.members.map(mapClassroomMemberDto)
      : [],
    contests: Array.isArray(dto.contests)
      ? dto.contests.map(mapBoundContestDto)
      : [],
    labs: Array.isArray(dto.labs)
      ? dto.labs.map(mapClassroomLabSummaryDto)
      : [],
    admins: Array.isArray(dto.admins)
      ? dto.admins.map((a: any) => ({ id: a.id, username: a.username }))
      : [],
    announcements: Array.isArray(dto.announcements)
      ? dto.announcements.map(mapClassroomAnnouncementDto)
      : [],
    updatedAt: dto.updated_at || "",
  };
}
