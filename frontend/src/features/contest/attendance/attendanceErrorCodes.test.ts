import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ATTENDANCE_ERROR_CODES } from "./attendanceErrorCodes";

const BACKEND_SOURCE = resolve(
  __dirname,
  "../../../../../backend/apps/contests/services/attendance.py",
);

function parseBackendCodes(): string[] {
  const source = readFileSync(BACKEND_SOURCE, "utf8");
  const match = source.match(/AttendanceErrorCode = Literal\[([\s\S]*?)\]/);
  if (!match) throw new Error("Could not locate AttendanceErrorCode Literal in backend");
  return Array.from(match[1].matchAll(/"([a-z_]+)"/g)).map((m) => m[1]);
}

describe("attendanceErrorCodes parity", () => {
  it("matches the backend AttendanceErrorCode Literal", () => {
    const backendCodes = parseBackendCodes();
    expect([...ATTENDANCE_ERROR_CODES].sort()).toEqual([...backendCodes].sort());
  });
});
