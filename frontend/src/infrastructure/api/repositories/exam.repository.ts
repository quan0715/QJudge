import { httpClient, requestJson } from "@/infrastructure/api/http.client";
import type {
  ExamEvent,
  ExamStatusType,
} from "@/core/entities/contest.entity";
import { mapExamEventDto } from "@/infrastructure/mappers/contest.mapper";

export interface ExamSessionResponse {
  status: string;
  exam_status?: ExamStatusType;
  submit_reason?: string;
  already_submitted?: boolean;
  error?: string;
}

export const isSubmittedExamSessionResponse = (
  response: ExamSessionResponse | null | undefined
): boolean => response?.exam_status === "submitted";

export interface ExamEventResponse {
  status?: string;
  message?: string;
  error?: string;
  event_id?: number | string;
  evidence_cluster_id?: string;
  evidence_window_start?: string;
  evidence_window_end?: string;
  evidence_mode?: EvidenceMode;
  evidence_anchor_at_ms?: number;
  violation_count?: number;
  max_cheat_warnings?: number;
  exam_status?: ExamStatusType;
  submit_reason?: string;
  locked?: boolean;
  bypass?: boolean;
  auto_unlock_at?: string;
}

export type EvidenceMode = "anchor_window" | "pre_loss" | "audit";
export type EvidenceSourceModule = "screen_share" | "webcam";

export interface RecordExamEventOptions {
  reason?: string;
  metadata?: Record<string, unknown>;
  source?: string;
  phase?: string;
  eventIdempotencyKey?: string;
}

export interface ExamAnswerDto {
  id: string;
  question_id: string;
  question_prompt: string;
  question_type: string;
  question_options: string[] | null;
  max_score: number;
  answer: unknown;
  is_correct: boolean | null;
  score: number | null;
  feedback: string;
  graded_by_username: string | null;
  graded_at: string | null;
  participant_user_id: number;
  participant_username: string;
  participant_nickname: string;
  created_at: string;
  updated_at: string;
}

export interface ExamDashboardQuestionSummaryDto {
  question_id: string;
  order: number;
  title: string;
  kind: string;
  max_score: number;
  answer_count: number;
  missing_count: number;
  average_score: number;
  score_rate: number;
  zero_rate: number;
  full_rate: number;
  status: "stable" | "attention" | "grading";
  objective_stats?: {
    correct_rate: number;
  };
  subjective_stats?: {
    graded_count: number;
    pending_count: number;
    grading_rate: number;
  };
}

export interface ExamDashboardSummaryDto {
  contest: {
    id: string;
    name: string;
    course: string;
    contest_type: "paper_exam" | "coding";
    participant_count: number;
    completed_count: number;
    results_published: boolean;
  };
  summary: {
    average_score: number;
    median_score: number;
    max_total_score: number;
  };
  score_distribution: Array<{
    range_label: string;
    count: number;
  }>;
  questions: ExamDashboardQuestionSummaryDto[];
}

export interface ExamDashboardQuestionDetailDto {
  question_id: string;
  kind: string;
  score_bands: Array<{ label: string; count: number }>;
  responses: Array<{
    participant_id: number;
    username: string;
    nickname: string | null;
    display_name: string;
    score: number | null;
    graded_at: string | null;
    feedback: string;
    answer: unknown;
  }>;
  option_distribution?: Array<{
    label: string;
    count: number;
    percent: number;
    is_correct: boolean;
    participants: Array<{
      participant_id: number;
      username: string;
      nickname: string | null;
      display_name: string;
    }>;
  }>;
  omitted_count?: number;
  omitted_participants?: Array<{
    participant_id: number;
    username: string;
    nickname: string | null;
    display_name: string;
  }>;
  grading_progress?: {
    graded: number;
    total: number;
  };
}

export interface RealtimeSfuConfigDto {
  enabled: boolean;
  configured: boolean;
  app_id: string;
  stun_urls: string[];
}

export interface RtcSessionDescriptionDto {
  type: "offer" | "answer";
  sdp: string;
}

export interface RealtimeSfuSessionDto {
  sessionId: string;
  room_id: string;
  role: "publisher" | "subscriber";
  sessionDescription?: RtcSessionDescriptionDto;
  [key: string]: unknown;
}

export type RealtimeSfuSourceModule = "screen_share" | "webcam";

export interface RealtimeSfuPublisherDto {
  contest_id: number;
  user_id: number;
  session_id: string;
  track_name: string;
  room_id: string;
  source_module?: RealtimeSfuSourceModule;
  updated_at: string;
}

export interface RealtimeSfuPublisherResponse {
  active: boolean;
  publisher: RealtimeSfuPublisherDto | null;
  publishers?: RealtimeSfuPublisherDto[];
}

export interface RealtimeSfuTrackRequest {
  sessionDescription?: RtcSessionDescriptionDto;
  tracks?: Array<Record<string, unknown>>;
}

export interface RealtimeSfuTrackResponse {
  requiresImmediateRenegotiation?: boolean;
  sessionDescription?: RtcSessionDescriptionDto;
  tracks?: Array<Record<string, unknown>>;
  publisher?: RealtimeSfuPublisherDto;
  [key: string]: unknown;
}

export const getRealtimeSfuConfig = async (
  contestId: string
): Promise<RealtimeSfuConfigDto> => {
  return requestJson<RealtimeSfuConfigDto>(
    httpClient.get(`/api/v1/contests/${contestId}/exam/sfu/config/`),
    "Failed to fetch Realtime SFU config"
  );
};

export const createRealtimeSfuSession = async (
  contestId: string,
  payload: { role: "publisher" | "subscriber"; target_user_id?: string }
): Promise<RealtimeSfuSessionDto> => {
  return requestJson<RealtimeSfuSessionDto>(
    httpClient.post(`/api/v1/contests/${contestId}/exam/sfu/sessions/`, payload),
    "Failed to create Realtime SFU session"
  );
};

export const addRealtimeSfuTracks = async (
  contestId: string,
  sessionId: string,
  payload: {
    role: "publisher" | "subscriber";
    payload: RealtimeSfuTrackRequest;
  }
): Promise<RealtimeSfuTrackResponse> => {
  return requestJson<RealtimeSfuTrackResponse>(
    httpClient.post(
      `/api/v1/contests/${contestId}/exam/sfu/sessions/${encodeURIComponent(sessionId)}/tracks/new/`,
      payload
    ),
    "Failed to add Realtime SFU tracks"
  );
};

export const renegotiateRealtimeSfuSession = async (
  contestId: string,
  sessionId: string,
  payload: { payload: RealtimeSfuTrackRequest }
): Promise<RealtimeSfuTrackResponse> => {
  return requestJson<RealtimeSfuTrackResponse>(
    httpClient.put(
      `/api/v1/contests/${contestId}/exam/sfu/sessions/${encodeURIComponent(sessionId)}/renegotiate/`,
      payload
    ),
    "Failed to renegotiate Realtime SFU session"
  );
};

export const getRealtimeSfuPublisher = async (
  contestId: string,
  targetUserId: string | number,
  sourceModule?: RealtimeSfuSourceModule
): Promise<RealtimeSfuPublisherResponse> => {
  const suffix = sourceModule
    ? `?source_module=${encodeURIComponent(sourceModule)}`
    : "";
  return requestJson<RealtimeSfuPublisherResponse>(
    httpClient.get(`/api/v1/contests/${contestId}/exam/sfu/publishers/${targetUserId}/${suffix}`),
    "Failed to fetch Realtime SFU publisher"
  );
};

export const heartbeatRealtimeSfuPublisher = async (
  contestId: string,
  sourceModule?: RealtimeSfuSourceModule
): Promise<RealtimeSfuPublisherResponse> => {
  return requestJson<RealtimeSfuPublisherResponse>(
    httpClient.post(`/api/v1/contests/${contestId}/exam/sfu/publisher/heartbeat/`, {
      source_module: sourceModule,
    }),
    "Failed to refresh Realtime SFU publisher"
  );
};

export const stopRealtimeSfuPublisher = async (
  contestId: string,
  sessionId?: string,
  sourceModule?: RealtimeSfuSourceModule
): Promise<RealtimeSfuPublisherResponse> => {
  return requestJson<RealtimeSfuPublisherResponse>(
    httpClient.post(`/api/v1/contests/${contestId}/exam/sfu/publisher/stop/`, {
      session_id: sessionId,
      source_module: sourceModule,
    }),
    "Failed to stop Realtime SFU publisher"
  );
};

const RETRYABLE_EVENT_STATUSES = new Set([502, 503, 504]);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
  payload?: { submit_reason?: string; upload_session_id?: string; source_module?: "screen_share" | "webcam" }
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

  const payload = {
    event_type: eventType,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await httpClient.post(
        `/api/v1/contests/${contestId}/exam/events/`,
        payload
      );
      if (res.ok) {
        return (await res.json()) as ExamEventResponse;
      }
      if (!RETRYABLE_EVENT_STATUSES.has(res.status) || attempt === maxAttempts) {
        return null;
      }
    } catch {
      if (attempt === maxAttempts) {
        return null;
      }
    }
    await sleep(150 * attempt);
  }
  return null;
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
  metadata: {
    source: "activity",
  },
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

export const getAllExamAnswers = async (
  contestId: string,
): Promise<ExamAnswerDto[]> => {
  return requestJson<ExamAnswerDto[]>(
    httpClient.get(`/api/v1/contests/${contestId}/exam-answers/all-answers/`),
    "Failed to fetch all exam answers",
  );
};

export const getExamDashboardSummary = async (
  contestId: string,
  opts: { kind?: string } = {},
): Promise<ExamDashboardSummaryDto> => {
  const search = new URLSearchParams();
  if (opts.kind) search.set("kind", opts.kind);
  const query = search.toString();
  const url = `/api/v1/contests/${contestId}/exam-answers/dashboard-summary/${query ? `?${query}` : ""}`;
  return requestJson<ExamDashboardSummaryDto>(
    httpClient.get(url),
    "Failed to fetch exam dashboard summary",
  );
};

export const getExamDashboardQuestionDetail = async (
  contestId: string,
  questionId: string,
): Promise<ExamDashboardQuestionDetailDto> => {
  const search = new URLSearchParams({ question_id: questionId });
  return requestJson<ExamDashboardQuestionDetailDto>(
    httpClient.get(`/api/v1/contests/${contestId}/exam-answers/question-detail/?${search.toString()}`),
    "Failed to fetch exam dashboard question detail",
  );
};

export interface AnticheatUploadItem {
  seq: number;
  object_key: string;
  module?: "screen_share" | "webcam";
  put_url: string;
  required_headers?: Record<string, string>;
}

export interface AnticheatUploadBatchItem {
  blob: Blob;
  put_url: string;
  required_headers?: Record<string, string>;
}

export interface AnticheatUrlsResponse {
  upload_session_id: string;
  module?: "screen_share" | "webcam";
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
  options?: { upload_session_id?: string; start_seq?: number; module?: "screen_share" | "webcam" }
): Promise<AnticheatUrlsResponse> => {
  const search = new URLSearchParams();
  search.set("count", String(count));
  if (options?.upload_session_id) {
    search.set("upload_session_id", options.upload_session_id);
  }
  if (typeof options?.start_seq === "number" && options.start_seq > 0) {
    search.set("start_seq", String(options.start_seq));
  }
  if (options?.module) {
    search.set("module", options.module);
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

export const uploadAnticheatBatch = async (
  items: AnticheatUploadBatchItem[]
): Promise<void> => {
  if (!items.length) return;

  await Promise.all(
    items.map(async (item) => {
      const response = await fetch(item.put_url, {
        method: "PUT",
        headers: {
          "Content-Type": item.blob.type || "image/webp",
          ...(item.required_headers || {}),
        },
        body: item.blob,
      });

      if (!response.ok) {
        throw new Error(`Failed to upload anticheat frame (${response.status})`);
      }
    })
  );
};

export interface EvidenceUploadIntentFrame {
  client_captured_at_ms: number;
  seq: number;
}

export interface EvidenceUploadIntentRequest {
  event_id: number | string;
  evidence_cluster_id?: string;
  source_module: EvidenceSourceModule;
  evidence_mode: EvidenceMode;
  upload_session_id?: string;
  frames: EvidenceUploadIntentFrame[];
  unavailable_reason?: string;
}

export interface EvidenceUploadIntentItem {
  evidence_frame_id: number;
  seq: number;
  object_key: string;
  source_module: EvidenceSourceModule;
  client_captured_at_ms: number;
  put_url: string;
  required_headers?: Record<string, string>;
}

export interface EvidenceUploadIntentResponse {
  upload_session_id: string;
  evidence_cluster_id?: string;
  evidence_mode?: EvidenceMode;
  expires_at?: string;
  unavailable?: boolean;
  unavailable_frame_id?: number;
  items: EvidenceUploadIntentItem[];
}

export interface EvidenceUploadConfirmFrame {
  evidence_frame_id: number;
  object_key: string;
  byte_size?: number;
  sha256?: string;
}

export const createEvidenceUploadIntent = async (
  contestId: string,
  payload: EvidenceUploadIntentRequest
): Promise<EvidenceUploadIntentResponse> => {
  return requestJson<EvidenceUploadIntentResponse>(
    httpClient.post(`/api/v1/contests/${contestId}/exam/evidence/upload-intents/`, payload),
    "Failed to create evidence upload intent"
  );
};

export const confirmEvidenceUpload = async (
  contestId: string,
  payload: {
    event_id?: number | string;
    upload_session_id?: string;
    frames: EvidenceUploadConfirmFrame[];
  }
): Promise<{ confirmed_count: number }> => {
  return requestJson<{ confirmed_count: number }>(
    httpClient.post(`/api/v1/contests/${contestId}/exam/evidence/upload-confirm/`, payload),
    "Failed to confirm evidence upload"
  );
};

export interface ScreenshotFrame {
  url: string;
  ts_ms: number;
  seq: number;
  source_module?: EvidenceSourceModule;
  evidence_frame_id?: number;
  evidence_mode?: EvidenceMode;
  expires_in: number;
}

export const fetchScreenshots = async (
  contestId: string,
  params: {
    user_id: string;
    ts_from?: number;
    ts_to?: number;
    event_id?: string | number;
    evidence_cluster_id?: string;
    upload_session_id?: string;
    source_module?: "screen_share" | "webcam";
    object_keys?: string[];
    limit?: number;
  }
): Promise<{ items: ScreenshotFrame[]; total_raw_count: number }> => {
  const search = new URLSearchParams();
  search.set("user_id", params.user_id);
  if (params.ts_from != null) search.set("ts_from", String(params.ts_from));
  if (params.ts_to != null) search.set("ts_to", String(params.ts_to));
  if (params.event_id != null) search.set("event_id", String(params.event_id));
  if (params.evidence_cluster_id) search.set("evidence_cluster_id", params.evidence_cluster_id);
  if (params.upload_session_id) search.set("upload_session_id", params.upload_session_id);
  if (params.source_module) search.set("source_module", params.source_module);
  if (params.object_keys?.length) {
    params.object_keys.forEach((key) => search.append("object_key", key));
  }
  if (params.limit != null) search.set("limit", String(params.limit));
  return requestJson<{ items: ScreenshotFrame[]; total_raw_count: number }>(
    httpClient.get(`/api/v1/contests/${contestId}/exam/screenshots/?${search.toString()}`),
    "Failed to fetch screenshots"
  );
};
