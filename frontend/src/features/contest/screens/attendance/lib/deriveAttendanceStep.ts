export type AttendanceStepId =
  | "scan"
  | "manual"
  | "photo"
  | "photoReview"
  | "confirm"
  | "done";

export interface DeriveAttendanceStepInput {
  isDone: boolean;
  manualMode: boolean;
  hasScan: boolean;
  hasReviewPhoto: boolean;
  allPhotosCaptured: boolean;
}

export function deriveAttendanceStep({
  isDone,
  manualMode,
  hasScan,
  hasReviewPhoto,
  allPhotosCaptured,
}: DeriveAttendanceStepInput): AttendanceStepId {
  if (isDone) return "done";
  if (manualMode) return "manual";
  if (!hasScan) return "scan";
  if (hasReviewPhoto) return "photoReview";
  if (allPhotosCaptured) return "confirm";
  return "photo";
}
