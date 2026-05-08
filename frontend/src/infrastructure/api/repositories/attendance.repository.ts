import { httpClient, requestJson } from "@/infrastructure/api/http.client";
import type { AttendancePurpose, ContestAttendanceStatus } from "@/core/entities/contest.entity";

export interface AttendanceQrTokenDto {
  purpose: AttendancePurpose;
  token: string;
  manual_code: string;
  qr_value: string;
  refresh_after_seconds: number;
  expires_in_seconds: number;
  expires_at: string;
}

export interface AttendanceQrToken {
  purpose: AttendancePurpose;
  token: string;
  manualCode: string;
  qrValue: string;
  refreshAfterSeconds: number;
  expiresInSeconds: number;
  expiresAt: string;
}

export type AttendanceEventPayload =
  | {
      mode: "student_self_scan";
      purpose: AttendancePurpose;
      token?: string;
      manualCode?: string;
      client_observed_at_ms?: number;
      device_kind?: string;
    }
  | {
      mode: "teacher_assisted";
      purpose: AttendancePurpose;
      user_id: string | number;
      reason: string;
    };

export interface AttendanceEventResponse {
  event_id: number;
  purpose: AttendancePurpose;
  source_module: "attendance";
  evidence_cluster_id: string;
  recorded_at: string;
  attendance_status: ContestAttendanceStatus;
}

const mapQrToken = (dto: AttendanceQrTokenDto): AttendanceQrToken => ({
  purpose: dto.purpose,
  token: dto.token,
  manualCode: dto.manual_code,
  qrValue: dto.qr_value,
  refreshAfterSeconds: dto.refresh_after_seconds,
  expiresInSeconds: dto.expires_in_seconds,
  expiresAt: dto.expires_at,
});

export const getAttendanceQrToken = async (
  contestId: string,
  purpose: AttendancePurpose,
): Promise<AttendanceQrToken> => {
  const data = await requestJson<AttendanceQrTokenDto>(
    httpClient.get(`/api/v1/contests/${contestId}/attendance/qr-token/?purpose=${purpose}`),
    "Failed to fetch attendance QR token",
  );
  return mapQrToken(data);
};

export const createAttendanceEvent = async (
  contestId: string,
  payload: AttendanceEventPayload,
): Promise<AttendanceEventResponse> => {
  let requestPayload: object = payload;
  if (payload.mode === "student_self_scan") {
    const { manualCode, ...restPayload } = payload;
    requestPayload = {
      ...restPayload,
      manual_code: manualCode,
    };
  }
  return requestJson<AttendanceEventResponse>(
    httpClient.post(`/api/v1/contests/${contestId}/attendance/events/`, requestPayload),
    "Failed to create attendance event",
  );
};

export interface AttendanceResetResponse {
  deleted_events: number;
  deleted_records: number;
  attendance_status: ContestAttendanceStatus;
}

export const resetParticipantAttendance = async (
  contestId: string,
  userId: string | number,
): Promise<AttendanceResetResponse> => {
  return requestJson<AttendanceResetResponse>(
    httpClient.post(`/api/v1/contests/${contestId}/attendance/reset/`, {
      user_id: userId,
    }),
    "Failed to reset participant attendance records",
  );
};

export interface ValidateAttendanceCredentialPayload {
  purpose: AttendancePurpose;
  token?: string;
  manualCode?: string;
}

export interface ValidateAttendanceCredentialResponse {
  valid: boolean;
  purpose: AttendancePurpose;
  credential_source: "qr_token" | "manual_code";
}

export const validateAttendanceCredential = async (
  contestId: string,
  payload: ValidateAttendanceCredentialPayload,
): Promise<ValidateAttendanceCredentialResponse> => {
  const body: Record<string, string> = { purpose: payload.purpose };
  if (payload.token) body.token = payload.token;
  if (payload.manualCode) body.manual_code = payload.manualCode;
  return requestJson<ValidateAttendanceCredentialResponse>(
    httpClient.post(`/api/v1/contests/${contestId}/attendance/validate/`, body),
    "Failed to validate attendance credential",
  );
};
