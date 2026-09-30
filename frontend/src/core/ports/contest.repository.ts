import type {
  AttendancePhotoPolicy,
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
  webcamRequired?: boolean;
  scoreboardVisibleDuringContest?: boolean;
  allowMultipleJoins?: boolean;
}
