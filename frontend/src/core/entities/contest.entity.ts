import type { UserRole } from "./user.entity";
import type { SubmissionStatus } from "./submission.entity";

export type ContestStatus = "inactive" | "active" | "archived" | "ended";
export type ContestVisibility = "public" | "private";
export type ExamEventType = "tab_hidden" | "window_blur" | "exit_fullscreen";

export interface ContestPermissions {
  canSwitchView: boolean;
  canEditContest: boolean;
  canToggleStatus: boolean;
  canPublishProblems: boolean;
  canViewAllSubmissions: boolean;
  canViewFullScoreboard: boolean;
  canManageClarifications: boolean;
}

export interface ContestProblemSummary {
  id: string; // ContestProblem ID
  problemId: string; // Actual Problem ID
  label: string; // A, B, C...
  title: string;
  order?: number;
  score?: number; // Problem score/points
  userStatus?: SubmissionStatus;
  difficulty?: string;
}

export interface ContestParticipant {
  userId: string;
  username: string;
  email?: string;
  score: number;
  rank?: number;
  joinedAt: string;
  // Primary state field
  examStatus: ExamStatusType;
  // Legacy fields removed
  lockReason?: string;
  violationCount: number;
  // Anonymous mode fields
  nickname?: string;
  displayName?: string;
}

export interface Contest {
  id: string;
  name: string;
  description: string;
  startTime: string;
  endTime: string;
  status: ContestStatus;
  visibility: ContestVisibility;
  password?: string;

  // User state
  hasJoined: boolean;
  isRegistered: boolean;
  currentUserRole?: UserRole;
  participantCount?: number;
}

// Explicit exam state for student participation
export type ExamStatusType =
  | "not_started"
  | "in_progress"
  | "paused"
  | "locked"
  | "submitted";

export interface ContestDetail extends Contest {
  rules?: string;

  // Exam mode
  examModeEnabled: boolean;
  scoreboardVisibleDuringContest: boolean;

  // Anonymous mode
  anonymousModeEnabled?: boolean;
  myNickname?: string;

  // Advanced settings
  allowMultipleJoins: boolean;
  maxCheatWarnings: number;
  allowAutoUnlock: boolean;
  autoUnlockMinutes: number;

  // User specific extended state
  hasStarted?: boolean;
  startedAt?: string;
  leftAt?: string;
  lockedAt?: string;
  lockReason?: string;
  examStatus?: ExamStatusType; // Primary state field
  autoUnlockAt?: string; // Auto-unlock time when locked

  permissions: ContestPermissions;
  problems: ContestProblemSummary[];

  // Multi-admin support
  admins?: Array<{ id: string; username: string }>;
}

// Scoreboard Types
export interface ScoreboardProblemCell {
  status: SubmissionStatus;
  attempts: number;
  time: number | null; // Minutes
}

export interface ScoreboardRow {
  userId: string;
  displayName: string;
  solvedCount: number;
  totalScore: number;
  penalty: number;
  rank: number;
  problems: Record<string, ScoreboardProblemCell>;
}

export interface ScoreboardData {
  contestId: string;
  contestName: string;
  problems: Array<{
    label: string;
    problemId: string;
  }>;
  rows: ScoreboardRow[];
}

// Exam Event Types
export interface ExamEvent {
  id: string;
  userId: string;
  userName: string;
  eventType: ExamEventType;
  timestamp: string;
  reason?: string;
}

export interface ExamEventStats {
  userId: string;
  userName: string;
  tabHiddenCount: number;
  windowBlurCount: number;
  exitFullscreenCount: number;
  totalViolations: number;
}

export interface ContestQuestion {
  id: string;
  title: string;
  content: string;
  answer?: string;
  isPublic: boolean;
  authorUsername?: string;
  answeredBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Clarification {
  id: string;
  question: string;
  answer?: string;
  problemId?: string;
  problemTitle?: string;
  isPublic: boolean;
  authorUsername: string;
  answeredBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContestAnnouncement {
  id: string;
  title: string;
  content: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExamModeState {
  isActive: boolean;
  isLocked: boolean;
  lockReason?: string;
  startTime?: Date;
  violationCount?: number;
  maxWarnings?: number;
  autoUnlockAt?: string;
}

export interface ContestUpdateRequest {
  name?: string;
  description?: string;
  rules?: string;
  startTime?: string;
  endTime?: string;
  status?: ContestStatus;
  visibility?: ContestVisibility;
  password?: string;
  examModeEnabled?: boolean;
  scoreboardVisibleDuringContest?: boolean;
  allowMultipleJoins?: boolean;
  maxCheatWarnings?: number;
  allowAutoUnlock?: boolean;
  autoUnlockMinutes?: number;
}

// ============ Contest State Utilities ============

export type ContestDisplayState = "upcoming" | "running" | "ended" | "inactive";

export const getContestState = (contest: {
  status?: string;
  startTime?: string;
  endTime?: string;
  start_time?: string;
  end_time?: string;
}): ContestDisplayState => {
  if (contest.status === "inactive") {
    return "inactive";
  }

  const now = new Date().getTime();
  const startTime = new Date(
    contest.startTime || contest.start_time || ""
  ).getTime();
  const endTime = new Date(contest.endTime || contest.end_time || "").getTime();

  if (now < startTime) {
    return "upcoming";
  } else if (now >= startTime && now <= endTime) {
    return "running";
  } else {
    return "ended";
  }
};

export const getContestStateLabel = (state: ContestDisplayState): string => {
  switch (state) {
    case "upcoming":
      return "即將開始";
    case "running":
      return "進行中";
    case "ended":
      return "已結束";
    case "inactive":
      return "未開放";
    default:
      return "未知";
  }
};

export const getContestStateColor = (
  state: ContestDisplayState
):
  | "red"
  | "magenta"
  | "purple"
  | "blue"
  | "cyan"
  | "teal"
  | "green"
  | "gray"
  | "cool-gray"
  | "warm-gray"
  | "high-contrast"
  | "outline" => {
  switch (state) {
    case "upcoming":
      return "blue";
    case "running":
      return "green";
    case "ended":
      return "gray";
    case "inactive":
      return "red";
    default:
      return "gray";
  }
};

export const isContestEnded = (contest: {
  endTime?: string;
  end_time?: string;
}): boolean => {
  const endTime = new Date(contest.endTime || contest.end_time || "").getTime();
  return new Date().getTime() > endTime;
};
