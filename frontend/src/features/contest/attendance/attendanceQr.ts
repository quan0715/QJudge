import type { AttendancePurpose } from "@/core/entities/contest.entity";

const QR_PREFIX = "qj-att:v1";

export interface ParsedAttendanceQr {
  purpose: AttendancePurpose;
  token: string;
}

export function parseAttendanceQrValue(value: string): ParsedAttendanceQr | null {
  const parts = value.trim().split(":");
  if (parts.length !== 4) return null;
  const [app, version, purpose, token] = parts;
  if (`${app}:${version}` !== QR_PREFIX) return null;
  if (purpose !== "check_in" && purpose !== "check_out") return null;
  if (!token) return null;
  return { purpose, token };
}
