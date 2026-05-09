import type { AttendancePurpose } from "@/core/entities/contest.entity";
import type { AttendanceTranslate } from "@/features/contest/screens/attendance/lib/photoRequirements";
import { isAttendanceErrorCode, type AttendanceErrorCode } from "./attendanceErrorCodes";

type ApiError = Error & {
  response?: { status: number; data?: { code?: string; detail?: string } };
};

export function getAttendanceErrorCode(error: unknown): AttendanceErrorCode | null {
  const code = (error as ApiError).response?.data?.code;
  return isAttendanceErrorCode(code) ? code : null;
}

type ErrorMessageBuilder = (
  tr: AttendanceTranslate,
  purpose: AttendancePurpose | undefined,
) => string;

const MESSAGES: Partial<Record<AttendanceErrorCode, ErrorMessageBuilder>> = {
  attendance_check_in_already_completed: (tr) =>
    tr("attendance.errors.checkInAlreadyCompleted", "您已完成簽到。"),
  attendance_check_out_already_completed: (tr) =>
    tr("attendance.errors.checkOutAlreadyCompleted", "您已完成簽退。"),
  checkout_not_available_until_submitted: (tr) =>
    tr("attendance.errors.checkoutAfterSubmit", "交卷後才可以簽退。"),
  check_in_only_before_personal_start: (tr, purpose) =>
    purpose === "check_in"
      ? tr(
          "attendance.errors.checkInOnlyBeforeStart",
          "您已開始或完成考試，不能再補簽到；若要離場請掃描簽退 QR Code。",
        )
      : tr("attendance.errors.notCheckInTime", "目前不在可簽到時間。"),
  invalid_attendance_token: (tr) =>
    tr(
      "attendance.errors.invalidToken",
      "QR Code 無效，請重新掃描投影畫面上的 QR Code。",
    ),
  invalid_attendance_manual_code: (tr) =>
    tr(
      "attendance.errors.invalidManualCode",
      "代碼無效或已過期，請重新輸入投影畫面上的最新代碼。",
    ),
  attendance_not_enabled: (tr) =>
    tr("attendance.errors.notEnabled", "此考試尚未開啟 QR Code 簽到簽退。"),
};

export function getAttendanceErrorMessage(
  error: unknown,
  tr: AttendanceTranslate,
  purpose?: AttendancePurpose,
): string {
  const code = getAttendanceErrorCode(error);
  const builder = code ? MESSAGES[code] : undefined;
  if (builder) return builder(tr, purpose);
  return tr("attendance.errors.submitFailed", "簽到資料送出失敗，請稍後再試。");
}
