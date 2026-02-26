export interface Classroom {
  id: string;
  name: string;
  description: string;
  ownerUsername: string;
  memberCount: number;
  isArchived: boolean;
  currentUserRole: string | null;
  createdAt: string;
}

export interface ClassroomMember {
  userId: number;
  username: string;
  email: string;
  role: "student" | "ta";
  joinedAt: string;
}

export interface BoundContest {
  contestId: string;
  contestName: string;
  boundAt: string;
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
