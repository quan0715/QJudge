import type { UserRole } from './user.entity';
import type { SubmissionStatus } from './submission.entity';

export type ContestStatus = 'inactive' | 'active' | 'archived' | 'ended';
export type ContestVisibility = 'public' | 'private';
export type ExamEventType = 'tab_hidden' | 'window_blur' | 'exit_fullscreen';

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
  id: string;      // ContestProblem ID
  problemId: string; // Actual Problem ID
  label: string;   // A, B, C...
  title: string;
  score?: number;
  order?: number;
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
  hasFinishedExam: boolean;
  isLocked: boolean;
  lockReason?: string;
  isPaused?: boolean;
  violationCount: number;
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

export interface ContestDetail extends Contest {
  rules?: string;
  
  // Exam mode
  examModeEnabled: boolean;
  scoreboardVisibleDuringContest: boolean;
  
  // Advanced settings
  allowMultipleJoins: boolean;
  banTabSwitching: boolean;
  maxCheatWarnings: number;
  allowAutoUnlock: boolean;
  autoUnlockMinutes: number;
  
  // User specific extended state
  hasStarted?: boolean;
  startedAt?: string;
  leftAt?: string;
  hasFinishedExam: boolean;
  isLocked?: boolean;
  lockedAt?: string;
  lockReason?: string;
  isPaused?: boolean;
  
  permissions: ContestPermissions;
  problems: ContestProblemSummary[];
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
    score?: number;
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
  banTabSwitching?: boolean;
  maxCheatWarnings?: number;
  allowAutoUnlock?: boolean;
  autoUnlockMinutes?: number;
}
