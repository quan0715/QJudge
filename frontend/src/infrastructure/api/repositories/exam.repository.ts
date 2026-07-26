import { httpClient, requestJson } from "@/infrastructure/api/http.client";
import type {
  EventFeedItem,
  ExamEvent,
  ExamStatusType,
} from "@/core/entities/contest.entity";
import type { EventFeedItemDto } from "@/infrastructure/api/dto/contest.dto";
import { mapExamEventDto } from "@/infrastructure/mappers/contest.mapper";
import { mapEventFeedItemDto } from "@/infrastructure/mappers/contest.participant.mapper";

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

export type EvidenceMode = "anchor_window" | "pre_loss" | "audit";
export type EvidenceSourceModule = "screen_share" | "webcam" | "attendance";

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
  participant_display_name: string;
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
      display_name: string;
    }>;
  }>;
  omitted_count?: number;
  omitted_participants?: Array<{
    participant_id: number;
    username: string;
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

export const getExamEvents = async (
  contestId: string
): Promise<{ events: ExamEvent[]; eventFeed: EventFeedItem[] }> => {
  const data = await requestJson<{
    events?: unknown[];
    event_feed?: EventFeedItemDto[];
  }>(
    httpClient.get(`/api/v1/contests/${contestId}/exam/events/`),
    "Failed to fetch exam events"
  );
  return {
    events: Array.isArray(data.events) ? data.events.map(mapExamEventDto) : [],
    eventFeed: Array.isArray(data.event_feed)
      ? data.event_feed.map(mapEventFeedItemDto)
      : [],
  };
};

export interface IntegrityEvidenceReviewItem {
  chunkId: string;
  source: "screen_share" | "webcam";
  status: "requested" | "uploaded" | "verified" | "failed" | "unavailable";
  startAtMs: number;
  endAtMs: number;
  byteSize: number;
  codec: string;
  contentType: string;
  url: string | null;
}

export interface IntegrityEvidenceReview {
  evidenceStatus: "pending" | "available" | "unavailable";
  evidenceSources: Record<string, { status: string; chunks: number }>;
  items: IntegrityEvidenceReviewItem[];
}

export const getIntegrityEvidenceReview = async (
  contestId: string,
  eventId: string,
): Promise<IntegrityEvidenceReview> => {
  const data = await requestJson<any>(
    httpClient.get(`/api/v1/contests/${contestId}/exam/integrity/evidence/review/?event_id=${encodeURIComponent(eventId)}`),
    "Failed to fetch integrity evidence",
  );
  return {
    evidenceStatus: data.evidence_status,
    evidenceSources: data.evidence_sources ?? {},
    items: Array.isArray(data.items) ? data.items.map((item: any) => ({
      chunkId: String(item.chunk_id), source: item.source, status: item.status,
      startAtMs: item.start_at_ms, endAtMs: item.end_at_ms, byteSize: item.byte_size,
      codec: item.codec, contentType: item.content_type, url: item.url ?? null,
    })) : [],
  };
};

/**
 * Map activity item to ExamEvent format
 */
const mapActivityToExamEvent = (item: ContestActivityDto): ExamEvent => ({
  id: item.id?.toString() || "",
  userId: item.user?.toString() || "",
  userName: item.username || "Unknown",
  eventType: (item.action_type as ExamEvent["eventType"]) || "other",
  priority: 3,
  category: "system",
  penalized: false,
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

export interface AttendanceEvidenceIntentFrame {
  client_captured_at_ms: number;
  seq: number;
}

export interface AttendanceEvidenceIntentRequest {
  event_id: number | string;
  evidence_cluster_id?: string;
  source_module: EvidenceSourceModule;
  evidence_mode: EvidenceMode;
  upload_session_id?: string;
  frames: AttendanceEvidenceIntentFrame[];
  unavailable_reason?: string;
}

export interface AttendanceEvidenceIntentItem {
  evidence_frame_id: number;
  seq: number;
  object_key: string;
  source_module: EvidenceSourceModule;
  client_captured_at_ms: number;
  put_url: string;
  required_headers?: Record<string, string>;
}

export interface AttendanceEvidenceIntentResponse {
  upload_session_id: string;
  evidence_cluster_id?: string;
  evidence_mode?: EvidenceMode;
  expires_at?: string;
  unavailable?: boolean;
  unavailable_frame_id?: number;
  items: AttendanceEvidenceIntentItem[];
}

export interface AttendanceEvidenceConfirmFrame {
  evidence_frame_id: number;
  object_key: string;
  byte_size?: number;
  sha256?: string;
}

export const createAttendanceEvidenceIntent = async (
  contestId: string,
  payload: AttendanceEvidenceIntentRequest
): Promise<AttendanceEvidenceIntentResponse> => {
  return requestJson<AttendanceEvidenceIntentResponse>(
    httpClient.post(`/api/v1/contests/${contestId}/exam/attendance/evidence/intents/`, payload),
    "Failed to create attendance evidence intent"
  );
};

export const confirmAttendanceEvidence = async (
  contestId: string,
  payload: {
    event_id?: number | string;
    upload_session_id?: string;
    frames: AttendanceEvidenceConfirmFrame[];
  }
): Promise<{ confirmed_count: number }> => {
  return requestJson<{ confirmed_count: number }>(
    httpClient.post(`/api/v1/contests/${contestId}/exam/attendance/evidence/confirm/`, payload),
    "Failed to confirm attendance evidence"
  );
};
