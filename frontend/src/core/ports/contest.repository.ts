import type {
  AttendancePhotoPolicy,
  Contest,
  ContestAnticheatConfig,
  ContestAnticheatDevicePolicy,
  ContestDetail,
  ContestOverviewMetrics,
  ContestStatus,
  ScoreboardData,
} from "@/core/entities/contest.entity";

export interface IContestRepository {
  getContests(scope?: string): Promise<Contest[]>;
  getContest(id: string): Promise<ContestDetail | undefined>;
  updateContest(id: string, data: ContestUpdatePayload): Promise<Contest>;
  deleteContest(id: string): Promise<void>;
  toggleStatus(id: string): Promise<{ status: string }>;
  registerContest(id: string, data?: Record<string, never>): Promise<void>;
  enterContest(id: string, data?: Record<string, never>): Promise<void>;
  archiveContest(id: string): Promise<void>;
  getContestStandings(id: string): Promise<ScoreboardData>;
  getContestAnticheatConfig(id: string): Promise<ContestAnticheatConfig>;
  getContestOverviewMetrics(id: string): Promise<ContestOverviewMetrics>;
}

export interface ContestUpdatePayload {
  name?: string;
  description?: string;
  rules?: string;
  startTime?: string;
  endTime?: string;
  status?: ContestStatus;
  resultsPublished?: boolean;
  attendanceCheckEnabled?: boolean;
  attendancePhotoPolicy?: AttendancePhotoPolicy;
  cheatDetectionEnabled?: boolean;
  anticheatDevicePolicy?: ContestAnticheatDevicePolicy;
  scoreboardVisibleDuringContest?: boolean;
  allowMultipleJoins?: boolean;
}
