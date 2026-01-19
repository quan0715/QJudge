import { httpClient, requestJson } from "@/infrastructure/api/http.client";
import type { ExamEvent } from "@/core/entities/contest.entity";
import { mapExamEventDto } from "@/infrastructure/mappers/contest.mapper";

export const startExam = async (contestId: string): Promise<any> => {
  return requestJson<any>(
    httpClient.post(`/api/v1/contests/${contestId}/exam/start/`),
    "Failed to start exam"
  );
};

export const endExam = async (contestId: string): Promise<any> => {
  return requestJson<any>(
    httpClient.post(`/api/v1/contests/${contestId}/exam/end/`),
    "Failed to end exam"
  );
};

export const recordExamEvent = async (
  contestId: string,
  eventType: string,
  lockReason?: string
): Promise<any> => {
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
  return res.json();
};

export const getExamEvents = async (
  contestId: string
): Promise<ExamEvent[]> => {
  const data = await requestJson<any>(
    httpClient.get(`/api/v1/contests/${contestId}/exam/events/`),
    "Failed to fetch exam events"
  );
  return Array.isArray(data) ? data.map(mapExamEventDto) : [];
};

/**
 * Map activity item to ExamEvent format
 */
const mapActivityToExamEvent = (item: any): ExamEvent => ({
  id: item.id?.toString() || "",
  userId: item.user?.toString() || "",
  userName: item.username || "Unknown",
  eventType: item.action_type || "other",
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
  const data = await res.json();

  // Handle both array and paginated response format for backward compatibility
  const results = Array.isArray(data) ? data : data.results || [];
  return results.map(mapActivityToExamEvent);
};
