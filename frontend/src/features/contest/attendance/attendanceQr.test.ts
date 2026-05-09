import { describe, expect, it } from "vitest";

import {
  buildStudentLocatorQrValue,
  parseAttendanceQrValue,
  parseStudentLocatorQrValue,
} from "./attendanceQr";

describe("parseAttendanceQrValue", () => {
  it("parses app-only attendance QR values", () => {
    expect(parseAttendanceQrValue("qj-att:v1:check_in:token-1")).toEqual({
      purpose: "check_in",
      token: "token-1",
    });
  });

  it("rejects URLs and unrelated QR values", () => {
    expect(parseAttendanceQrValue("https://example.com/check-in")).toBeNull();
    expect(parseAttendanceQrValue("qj-att:v1:other:token-1")).toBeNull();
  });
});

describe("student locator QR", () => {
  it("builds and parses static student locator QR values", () => {
    const value = buildStudentLocatorQrValue("contest-1", "42");

    expect(value).toBe("qj-student:v1:contest-1:42");
    expect(parseStudentLocatorQrValue(value)).toEqual({
      contestId: "contest-1",
      userId: "42",
    });
  });

  it("rejects attendance credential QR values", () => {
    expect(parseStudentLocatorQrValue("qj-att:v1:check_in:token-1")).toBeNull();
  });
});
