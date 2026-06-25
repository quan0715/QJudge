import type { AttendancePurpose } from "@/core/entities/contest.entity";
import type { AttendanceQrToken } from "@/infrastructure/api/repositories/attendance.repository";

export type ProjectionTokenState = Partial<Record<AttendancePurpose, AttendanceQrToken>>;

const FALLBACK_PROJECTION_REFRESH_MS = 30_000;
const MIN_PROJECTION_REFRESH_MS = 1_000;

export function getProjectionTokenRefreshDelayMs(
  tokens: ProjectionTokenState,
  now = Date.now(),
): number {
  const refreshSeconds =
    tokens.check_in?.refreshAfterSeconds ||
    tokens.check_out?.refreshAfterSeconds ||
    FALLBACK_PROJECTION_REFRESH_MS / 1000;
  const intervalMs = refreshSeconds * 1000;
  const expiryTimes = Object.values(tokens)
    .map((token) => (token?.expiresAt ? new Date(token.expiresAt).getTime() : NaN))
    .filter(Number.isFinite);
  if (expiryTimes.length === 0) return intervalMs;
  const expiresInMs = Math.min(...expiryTimes) - now;
  return Math.max(
    MIN_PROJECTION_REFRESH_MS,
    Math.min(intervalMs, expiresInMs),
  );
}
