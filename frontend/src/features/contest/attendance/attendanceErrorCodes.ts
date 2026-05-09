// Mirror of backend ATTENDANCE_ERROR_CODES (see backend/apps/contests/services/attendance.py).
// Keep this list in sync; the parity test compares the two as sets (order does not matter).
export const ATTENDANCE_ERROR_CODES = [
  "attendance_check_in_required",
  "attendance_credential_conflict",
  "attendance_manual_code_generation_failed",
  "attendance_not_enabled",
  "attendance_teacher_permission_required",
  "attendance_token_required",
  "check_in_only_before_personal_start",
  "checkout_not_available_until_submitted",
  "invalid_attendance_manual_code",
  "invalid_attendance_mode",
  "invalid_attendance_purpose",
  "invalid_attendance_request",
  "invalid_attendance_token",
  "not_registered",
  "participant_not_found",
  "reason_required",
  "token_forbidden_for_teacher_assisted",
  "user_id_forbidden_for_self_scan",
  "user_id_required",
] as const;

export type AttendanceErrorCode = (typeof ATTENDANCE_ERROR_CODES)[number];

export const isAttendanceErrorCode = (
  value: unknown,
): value is AttendanceErrorCode =>
  typeof value === "string" &&
  (ATTENDANCE_ERROR_CODES as readonly string[]).includes(value);
