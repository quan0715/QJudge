import { httpClient, requestJson } from "@/infrastructure/api/http.client";
import type {
  ExamEvent,
  ExamStatusType,
} from "@/core/entities/contest.entity";
import { mapExamEventDto } from "@/infrastructure/mappers/contest.mapper";

interface ExamSessionResponse {
  status: string;
  exam_status?: ExamStatusType;
  submit_reason?: string;
  already_submitted?: boolean;
  error?: string;
}

export interface ExamEventResponse {
  status?: string;
  message?: string;
  error?: string;
  violation_count?: number;
  max_cheat_warnings?: number;
  exam_status?: ExamStatusType;
  submit_reason?: string;
  locked?: boolean;
  bypass?: boolean;
  auto_unlock_at?: string;
}

export interface RecordExamEventOptions {
  reason?: string;
  metadata?: Record<string, unknown>;
  source?: string;
  phase?: string;
  eventIdempotencyKey?: string;
}

interface ContestActivityDto {
  id?: string | number;
  user?: string | number;
  username?: string;
  action_type?: string;
  created_at?: string;
  details?: string;
}

interface PaginatedActivitiesDto {
  results?: ContestActivityDto[];
}

export const startExam = async (contestId: string): Promise<ExamSessionResponse> => {
  return requestJson<ExamSessionResponse>(
    httpClient.post(`/api/v1/contests/${contestId}/exam/start/`),
    "Failed to start exam"
  );
};

export const endExam = async (
  contestId: string,
  payload?: { submit_reason?: string; upload_session_id?: string }
): Promise<ExamSessionResponse> => {
  return requestJson<ExamSessionResponse>(
    httpClient.post(`/api/v1/contests/${contestId}/exam/end/`, payload ?? {}),
    "Failed to end exam"
  );
};

export const recordExamEvent = async (
  contestId: string,
  eventType: string,
  reasonOrOptions?: string | RecordExamEventOptions
): Promise<ExamEventResponse | null> => {
  const options: RecordExamEventOptions =
    typeof reasonOrOptions === "string"
      ? { reason: reasonOrOptions }
      : reasonOrOptions || {};

  const metadata = {
    ...(options.metadata || {}),
    ...(options.reason ? { reason: options.reason } : {}),
    ...(options.source ? { source: options.source } : {}),
    ...(options.phase ? { phase: options.phase } : {}),
    ...(options.eventIdempotencyKey
      ? { event_idempotency_key: options.eventIdempotencyKey }
      : {}),
  };

  const res = await httpClient.post(
    `/api/v1/contests/${contestId}/exam/events/`,
    {
      event_type: eventType,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    }
  );
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as ExamEventResponse;
};

export const getExamEvents = async (
  contestId: string
): Promise<ExamEvent[]> => {
  const data = await requestJson<unknown>(
    httpClient.get(`/api/v1/contests/${contestId}/exam/events/`),
    "Failed to fetch exam events"
  );
  return Array.isArray(data) ? data.map(mapExamEventDto) : [];
};

/**
 * Map activity item to ExamEvent format
 */
const mapActivityToExamEvent = (item: ContestActivityDto): ExamEvent => ({
  id: item.id?.toString() || "",
  userId: item.user?.toString() || "",
  userName: item.username || "Unknown",
  eventType: (item.action_type as ExamEvent["eventType"]) || "other",
  timestamp: item.created_at || "",
  reason: item.details || "",
});

/**
 * Get contest activities (all events including admin actions, registrations, etc.)
 * Returns all activities without pagination (admin-only API)
 */
export const getContestActivities = async (
  contestId: string
): Promise<ExamEvent[]> => {
  const res = await httpClient.get(`/api/v1/contests/${contestId}/activities/`);
  if (!res.ok) {
    // Return empty array if not authorized (only admin/teacher can access)
    if (res.status === 403) return [];
    const errorData = await res.json().catch(() => null);
    throw new Error(errorData?.detail || "Failed to fetch contest activities");
  }
  const data = (await res.json()) as ContestActivityDto[] | PaginatedActivitiesDto;

  // Handle both array and paginated response format for backward compatibility
  const results = Array.isArray(data) ? data : data.results || [];
  return results.map(mapActivityToExamEvent);
};

export interface AnticheatUploadItem {
  seq: number;
  object_key: string;
  put_url: string;
  required_headers?: Record<string, string>;
}

export interface AnticheatUrlsResponse {
  upload_session_id: string;
  expires_at: string;
  interval_seconds: number;
  next_seq?: number;
  items: AnticheatUploadItem[];
}

export interface AnticheatUrlsRequestError extends Error {
  status?: number;
  retryAfterMs?: number;
}

const parseRetryAfterMs = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const asDate = Date.parse(value);
  if (Number.isNaN(asDate)) return undefined;
  const delta = asDate - Date.now();
  return delta > 0 ? delta : undefined;
};

export const getAnticheatUrls = async (
  contestId: string,
  count = 30,
  options?: { upload_session_id?: string; start_seq?: number }
): Promise<AnticheatUrlsResponse> => {
  const search = new URLSearchParams();
  search.set("count", String(count));
  if (options?.upload_session_id) {
    search.set("upload_session_id", options.upload_session_id);
  }
  if (typeof options?.start_seq === "number" && options.start_seq > 0) {
    search.set("start_seq", String(options.start_seq));
  }

  const response = await httpClient.get(
    `/api/v1/contests/${contestId}/exam/anticheat-urls/?${search.toString()}`
  );
  if (!response.ok) {
    const errorData = (await response.json().catch(() => null)) as
      | { detail?: string; message?: string; error?: string }
      | null;
    const message =
      errorData?.detail ||
      errorData?.message ||
      errorData?.error ||
      "Failed to fetch anticheat upload URLs";
    const err = new Error(message) as AnticheatUrlsRequestError;
    err.status = response.status;
    err.retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
    throw err;
  }

  return (await response.json()) as AnticheatUrlsResponse;
};

export interface ExamVideoDto {
  id: number;
  job_id?: number;
  participant_user_id: number;
  participant_username: string;
  upload_session_id: string;
  bucket: string;
  object_key: string;
  duration_seconds: number;
  frame_count: number;
  size_bytes: number;
  is_suspected: boolean;
  suspected_note: string;
  suspected_by?: number | null;
  suspected_by_username?: string | null;
  suspected_at?: string | null;
  created_at: string;
  updated_at: string;
  has_video?: boolean;
  job_status?: "pending" | "running" | "success" | "failed";
  job_error_message?: string;
  job_raw_count?: number;
  job_updated_at?: string;
  last_activity_at?: string;
}

export const listExamVideos = async (
  contestId: string,
  params?: { user_id?: string; flagged?: boolean }
): Promise<ExamVideoDto[]> => {
  const search = new URLSearchParams();
  if (params?.user_id) search.set("user_id", params.user_id);
  if (params?.flagged) search.set("flagged", "true");
  const query = search.toString();
  return requestJson<ExamVideoDto[]>(
    httpClient.get(`/api/v1/contests/${contestId}/exam/videos/${query ? `?${query}` : ""}`),
    "Failed to fetch exam videos"
  );
};

export const getExamVideoPlayUrl = async (
  contestId: string,
  videoId: number
): Promise<{ url: string; expires_in: number }> => {
  return requestJson<{ url: string; expires_in: number }>(
    httpClient.get(`/api/v1/contests/${contestId}/exam/videos/${videoId}/play-url/`),
    "Failed to fetch video play URL"
  );
};

export const getExamVideoDownloadUrl = async (
  contestId: string,
  videoId: number
): Promise<{ url: string; expires_in: number }> => {
  return requestJson<{ url: string; expires_in: number }>(
    httpClient.get(`/api/v1/contests/${contestId}/exam/videos/${videoId}/download-url/`),
    "Failed to fetch video download URL"
  );
};

export const compileExamVideos = async (
  contestId: string,
  targets: Array<{ user_id: number; upload_session_id?: string }>,
): Promise<{ queued: Array<{ user_id: number; upload_session_id: string }> }> => {
  return requestJson<{ queued: Array<{ user_id: number; upload_session_id: string }> }>(
    httpClient.post(
      `/api/v1/contests/${contestId}/exam/videos/compile/`,
      { targets },
    ),
    "Failed to trigger video compilation"
  );
};

export const deleteExamVideos = async (
  contestId: string,
  targets: Array<{ user_id: number; upload_session_id?: string }>,
): Promise<{
  deleted: Array<{ user_id: number; upload_session_id: string }>;
  blocked: Array<{ user_id: number; upload_session_id: string; reason: string }>;
}> => {
  return requestJson<{
    deleted: Array<{ user_id: number; upload_session_id: string }>;
    blocked: Array<{ user_id: number; upload_session_id: string; reason: string }>;
  }>(
    httpClient.post(
      `/api/v1/contests/${contestId}/exam/videos/delete/`,
      { targets },
    ),
    "Failed to delete exam videos"
  );
};

export const flagExamVideo = async (
  contestId: string,
  videoId: number,
  payload: { is_suspected: boolean; note?: string }
): Promise<ExamVideoDto> => {
  return requestJson<ExamVideoDto>(
    httpClient.patch(`/api/v1/contests/${contestId}/exam/videos/${videoId}/flag/`, payload),
    "Failed to update video flag"
  );
};
