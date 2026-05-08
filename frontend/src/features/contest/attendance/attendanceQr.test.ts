import { describe, expect, it } from "vitest";

import { parseAttendanceQrValue } from "./attendanceQr";

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
