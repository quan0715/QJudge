import type {
  AttendancePhotoPolicy,
  ContestAnticheatDevicePolicy,
  ContestStatus,
} from "@/core/entities/contest.entity";

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
