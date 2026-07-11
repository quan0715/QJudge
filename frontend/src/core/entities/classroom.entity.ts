export type ClassroomScopeRole =
  | "platform_admin"
  | "owner"
  | "manager"
  | "member";

export interface Classroom {
  id: string;
  name: string;
  description: string;
  ownerUsername: string;
  memberCount: number;
  isArchived: boolean;
  currentUserRole: ClassroomScopeRole | null;
  icon: string;
  coverUrl: string;
  createdAt: string;
}

export interface ClassroomMember {
  userId: number;
  username: string;
  email: string;
  avatarUrl?: string;
  role: "student" | "ta";
  joinedAt: string;
}

export interface BoundContest {
  contestId: string;
  contestName: string;
  contestDescription: string;
  contestStatus: "draft" | "published" | "archived";
  contestVisibility: "public" | "private";
  attendanceCheckEnabled?: boolean;
  contestType: "coding" | "paper_exam";
  contestStartTime: string;
  contestEndTime: string;
  contestOwnerUsername: string;
  resultsPublished?: boolean;
  participantCount: number;
  boundAt: string;
}

export function getBoundContestTimeRange(contest: BoundContest): {
  startMs: number;
  endMs: number;
} {
  const startIso = contest.contestStartTime || contest.boundAt;
  const endIso = contest.contestEndTime || contest.boundAt;
  return {
    startMs: new Date(startIso).getTime(),
    endMs: new Date(endIso).getTime(),
  };
}

export interface ClassroomAnnouncement {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  createdByUsername: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClassroomDetail extends Classroom {
  inviteCode: string | null;
  inviteCodeEnabled: boolean;
  members: ClassroomMember[];
  contests: BoundContest[];
  admins: { id: number; username: string }[];
  announcements: ClassroomAnnouncement[];
  updatedAt: string;
}
