import { describe, expect, it } from "vitest";

import {
  getAttendanceErrorCode,
  getAttendanceErrorMessage,
} from "./attendanceErrorMessages";

const tr = (_key: string, defaultValue: string) => defaultValue;

const apiError = (code: string) =>
  Object.assign(new Error("api"), { response: { status: 400, data: { code } } });

describe("getAttendanceErrorCode", () => {
  it("returns the code when it is a known attendance error", () => {
    expect(getAttendanceErrorCode(apiError("invalid_attendance_token"))).toBe(
      "invalid_attendance_token",
    );
  });

  it("returns null for unknown codes", () => {
    expect(getAttendanceErrorCode(apiError("totally_unknown"))).toBeNull();
  });

  it("returns null when error has no response payload", () => {
    expect(getAttendanceErrorCode(new Error("network"))).toBeNull();
  });
});

describe("getAttendanceErrorMessage", () => {
  it.each([
    [
      "checkout_not_available_until_submitted",
      undefined,
      "交卷後才可以簽退。",
    ],
    [
      "invalid_attendance_token",
      "check_in" as const,
      "QR Code 無效，請重新掃描投影畫面上的 QR Code。",
    ],
    [
      "invalid_attendance_manual_code",
      "check_in" as const,
      "代碼無效或已過期，請重新輸入投影畫面上的最新代碼。",
    ],
    [
      "attendance_not_enabled",
      undefined,
      "此考試尚未開啟 QR Code 簽到簽退。",
    ],
  ])("maps %s to its dedicated message", (code, purpose, expected) => {
    expect(getAttendanceErrorMessage(apiError(code), tr, purpose)).toBe(expected);
  });

  it("branches check_in_only_before_personal_start by purpose", () => {
    expect(
      getAttendanceErrorMessage(
        apiError("check_in_only_before_personal_start"),
        tr,
        "check_in",
      ),
    ).toBe(
      "您已開始或完成考試，不能再補簽到；若要離場請掃描簽退 QR Code。",
    );
    expect(
      getAttendanceErrorMessage(
        apiError("check_in_only_before_personal_start"),
        tr,
        "check_out",
      ),
    ).toBe("目前不在可簽到時間。");
  });

  it("falls back to generic message for unknown codes", () => {
    expect(getAttendanceErrorMessage(apiError("unknown_code"), tr)).toBe(
      "簽到資料送出失敗，請稍後再試。",
    );
  });

  it("falls back when error has no code at all", () => {
    expect(getAttendanceErrorMessage(new Error("boom"), tr)).toBe(
      "簽到資料送出失敗，請稍後再試。",
    );
  });
});
