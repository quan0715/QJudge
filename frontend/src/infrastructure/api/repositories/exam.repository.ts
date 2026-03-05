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
  error?: string;
}

interface ExamEventResponse {
  status?: string;
  message?: string;
  error?: string;
  violation_count?: number;
  max_cheat_warnings?: number;
  exam_status?: ExamStatusType;
  submitted?: boolean;
  submit_reason?: string;
  locked?: boolean;
  bypass?: boolean;
  auto_unlock_at?: string;
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
  payload?: { submit_reason?: string }
): Promise<ExamSessionResponse> => {
  return requestJson<ExamSessionResponse>(
    httpClient.post(`/api/v1/contests/${contestId}/exam/end/`, payload ?? {}),
    "Failed to end exam"
  );
};

export const sendExamHeartbeat = async (
  contestId: string,
  payload: { is_focused: boolean; is_fullscreen: boolean }
): Promise<{
  status: string;
  exam_status?: ExamStatusType;
  violation_count?: number;
  max_warnings?: number;
}> => {
  return requestJson<{
    status: string;
    exam_status?: ExamStatusType;
    violation_count?: number;
    max_warnings?: number;
  }>(
    httpClient.post(`/api/v1/contests/${contestId}/exam/heartbeat/`, payload),
    "Failed to send exam heartbeat"
  );
};

export const recordExamEvent = async (
  contestId: string,
  eventType: string,
  lockReason?: string
): Promise<ExamEventResponse | null> => {
  const res = await httpClient.post(
    `/api/v1/contests/${contestId}/exam/events/`,
    {
      event_type: eventType,
      lock_reason: lockReason,
    }
  );
  if (!res.ok) {
    console.error("Failed to record exam event:", eventType);
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
