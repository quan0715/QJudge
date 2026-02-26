import type {
  Classroom,
  ClassroomDetail,
  ClassroomMember,
  BoundContest,
} from "@/core/entities/classroom.entity";

export function mapClassroomDto(dto: any): Classroom {
  return {
    id: dto.id?.toString() || "",
    name: dto.name || "",
    description: dto.description || "",
    ownerUsername: dto.owner_username || "",
    memberCount: dto.member_count ?? 0,
    isArchived: !!dto.is_archived,
    currentUserRole: dto.current_user_role ?? null,
    createdAt: dto.created_at || "",
  };
}

export function mapClassroomMemberDto(dto: any): ClassroomMember {
  return {
    userId: dto.user_id,
    username: dto.username || "",
    email: dto.email || "",
    role: dto.role || "student",
    joinedAt: dto.joined_at || "",
  };
}

export function mapBoundContestDto(dto: any): BoundContest {
  return {
    contestId: dto.contest_id?.toString() || "",
    contestName: dto.contest_name || "",
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
    admins: Array.isArray(dto.admins)
      ? dto.admins.map((a: any) => ({ id: a.id, username: a.username }))
      : [],
    updatedAt: dto.updated_at || "",
  };
}
