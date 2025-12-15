import { httpClient } from "@/services/api/httpClient";
import type {
  Contest,
  ContestDetail,
  ContestQuestion,
  ScoreboardData,
  ExamEvent,
  ContestParticipant,
} from "@/core/entities/contest.entity";
import type { Problem, ProblemDetail } from "@/core/entities/problem.entity";
import {
  mapContestDto,
  mapContestDetailDto,
  mapScoreboardDto,
  mapExamEventDto,
  mapContestQuestionDto,
  mapContestParticipantDto,
} from "@/core/entities/mappers/contestMapper";
import {
  mapProblemDto,
  mapProblemDetailDto,
} from "@/core/entities/mappers/problemMapper";

export const getContests = async (scope?: string): Promise<Contest[]> => {
  const query = scope ? `?scope=${scope}` : "";
  const res = await httpClient.get(`/api/v1/contests/${query}`);
  if (!res.ok) throw new Error("Failed to fetch contests");
  const data = await res.json();
  const results = data.results || data;
  return Array.isArray(results) ? results.map(mapContestDto) : [];
};

export const getContest = async (
  id: string
): Promise<ContestDetail | undefined> => {
  const res = await httpClient.get(`/api/v1/contests/${id}/`);
  if (!res.ok) return undefined;
  const data = await res.json();
  return mapContestDetailDto(data);
};

export const getContestProblem = async (
  contestId: string,
  problemId: string
): Promise<ProblemDetail | undefined> => {
  const res = await httpClient.get(
    `/api/v1/contests/${contestId}/problems/${problemId}/`
  );
  if (!res.ok) return undefined;
  const data = await res.json();
  return mapProblemDetailDto(data);
};

export const createContest = async (data: any): Promise<Contest> => {
  const res = await httpClient.post("/api/v1/contests/", data);
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.detail || "Failed to create contest");
  }
  const responseData = await res.json();
  return mapContestDto(responseData);
};

export const updateContest = async (
  id: string,
  data: any
): Promise<Contest> => {
  const res = await httpClient.patch(`/api/v1/contests/${id}/`, data);
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.detail || "Failed to update contest");
  }
  const responseData = await res.json();
  return mapContestDto(responseData);
};

export const toggleStatus = async (id: string): Promise<{ status: string }> => {
  const res = await httpClient.post(`/api/v1/contests/${id}/toggle_status/`);
  if (!res.ok) throw new Error("Failed to toggle contest status");
  return res.json();
};

export const deleteContest = async (id: string): Promise<void> => {
  const res = await httpClient.delete(`/api/v1/contests/${id}/`);
  if (!res.ok) throw new Error("Failed to delete contest");
};

export const registerContest = async (
  id: string,
  data?: { password?: string; nickname?: string }
): Promise<any> => {
  const res = await httpClient.post(`/api/v1/contests/${id}/register/`, data);
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.message || "Registration failed");
  }
  return res.json();
};

export const enterContest = async (id: string): Promise<any> => {
  const res = await httpClient.post(`/api/v1/contests/${id}/enter/`);
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.message || "Failed to enter contest");
  }
  return res.json();
};

export const leaveContest = async (id: string): Promise<any> => {
  const res = await httpClient.post(`/api/v1/contests/${id}/leave/`);
  if (!res.ok) throw new Error("Failed to leave contest");
  return res.json();
};

export const getContestAnnouncements = async (id: string): Promise<any[]> => {
  const res = await httpClient.get(`/api/v1/contests/${id}/announcements/`);
  if (!res.ok) throw new Error("Failed to fetch announcements");
  return res.json();
};

export const createContestAnnouncement = async (
  contestId: string,
  data: { title: string; content: string }
): Promise<any> => {
  const res = await httpClient.post(
    `/api/v1/contests/${contestId}/announcements/`,
    data
  );
  if (!res.ok) throw new Error("Failed to create announcement");
  return res.json();
};

export const deleteContestAnnouncement = async (
  contestId: string,
  announcementId: string
): Promise<void> => {
  const res = await httpClient.delete(
    `/api/v1/contests/${contestId}/announcements/${announcementId}/`
  );
  if (!res.ok) throw new Error("Failed to delete announcement");
};

export const getContestStandings = async (
  id: string
): Promise<ScoreboardData> => {
  const res = await httpClient.get(`/api/v1/contests/${id}/standings/`);
  if (!res.ok) throw new Error("Failed to fetch standings");
  const data = await res.json();
  return mapScoreboardDto(data);
};

export const addContestProblem = async (
  contestId: string,
  data: { title?: string; problem_id?: string }
): Promise<Problem> => {
  const res = await httpClient.post(
    `/api/v1/contests/${contestId}/add_problem/`,
    data
  );
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.message || "Failed to add problem");
  }
  const responseData = await res.json();
  return mapProblemDto(responseData);
};

export const createContestProblem = async (
  contestId: string,
  data: any
): Promise<Problem> => {
  const res = await httpClient.post(
    `/api/v1/contests/${contestId}/problems/`,
    data
  );
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.message || "Failed to create problem");
  }
  const responseData = await res.json();
  return mapProblemDto(responseData);
};

export const removeContestProblem = async (
  contestId: string,
  problemId: string
): Promise<void> => {
  const res = await httpClient.delete(
    `/api/v1/contests/${contestId}/problems/${problemId}/`
  );
  if (!res.ok) throw new Error("Failed to remove problem");
};

export const reorderContestProblems = async (
  contestId: string,
  orders: { id: string | number; order: number }[]
): Promise<void> => {
  const res = await httpClient.post(
    `/api/v1/contests/${contestId}/reorder_problems/`,
    { orders }
  );
  if (!res.ok) throw new Error("Failed to reorder problems");
};

export const endContest = async (contestId: string): Promise<any> => {
  const res = await httpClient.post(
    `/api/v1/contests/${contestId}/end_contest/`
  );
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.message || "Failed to end contest");
  }
  return res.json();
};

export const publishProblemToPractice = async (
  contestId: string,
  problemId: string
): Promise<any> => {
  const res = await httpClient.post(
    `/api/v1/contests/${contestId}/problems/${problemId}/publish/`
  );
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.message || "Failed to publish problem");
  }
  return res.json();
};

export const getContestQuestions = async (
  contestId: string
): Promise<ContestQuestion[]> => {
  const res = await httpClient.get(`/api/v1/contests/${contestId}/questions/`);
  if (!res.ok) throw new Error("Failed to fetch questions");
  const data = await res.json();
  return Array.isArray(data) ? data.map(mapContestQuestionDto) : [];
};

export const createContestQuestion = async (
  contestId: string,
  data: { title: string; content: string }
): Promise<ContestQuestion> => {
  const res = await httpClient.post(
    `/api/v1/contests/${contestId}/questions/`,
    data
  );
  if (!res.ok) throw new Error("Failed to post question");
  const responseData = await res.json();
  return mapContestQuestionDto(responseData);
};

export const answerContestQuestion = async (
  contestId: string,
  questionId: string,
  answer: string
): Promise<ContestQuestion> => {
  const res = await httpClient.post(
    `/api/v1/contests/${contestId}/questions/${questionId}/answer/`,
    { answer }
  );
  if (!res.ok) throw new Error("Failed to answer question");
  const responseData = await res.json();
  return mapContestQuestionDto(responseData);
};

export const archiveContest = async (contestId: string): Promise<void> => {
  const res = await httpClient.post(`/api/v1/contests/${contestId}/archive/`);
  if (!res.ok) throw new Error("Failed to archive contest");
};

export const startExam = async (contestId: string): Promise<any> => {
  const res = await httpClient.post(
    `/api/v1/contests/${contestId}/exam/start/`
  );
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.message || "Failed to start exam");
  }
  return res.json();
};

export const endExam = async (contestId: string): Promise<any> => {
  const res = await httpClient.post(`/api/v1/contests/${contestId}/exam/end/`);
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.message || "Failed to end exam");
  }
  return res.json();
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
  const res = await httpClient.get(
    `/api/v1/contests/${contestId}/exam/events/`
  );
  if (!res.ok) throw new Error("Failed to fetch exam events");
  const data = await res.json();
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
 * Fetches all pages of paginated results
 */
export const getContestActivities = async (
  contestId: string
): Promise<ExamEvent[]> => {
  const allActivities: ExamEvent[] = [];
  let nextUrl: string | null = `/api/v1/contests/${contestId}/activities/`;

  while (nextUrl) {
    const res = await httpClient.get(nextUrl);
    if (!res.ok) {
      // Return empty array if not authorized (only admin/teacher can access)
      if (res.status === 403) return [];
      throw new Error("Failed to fetch contest activities");
    }

    const data = await res.json();

    // Handle paginated response format: { count, next, previous, results }
    if (data && typeof data === "object" && "results" in data) {
      const results = data.results || [];
      allActivities.push(...results.map(mapActivityToExamEvent));
      // Get next page URL (convert absolute URL to relative path)
      nextUrl = data.next
        ? data.next.replace(/^https?:\/\/[^/]+/, "")
        : null;
    } else if (Array.isArray(data)) {
      // Fallback for non-paginated response (backward compatibility)
      allActivities.push(...data.map(mapActivityToExamEvent));
      nextUrl = null;
    } else {
      nextUrl = null;
    }
  }

  return allActivities;
};

export const getScoreboard = async (
  contestId: string
): Promise<ScoreboardData> => {
  const res = await httpClient.get(`/api/v1/contests/${contestId}/standings/`);
  if (!res.ok) {
    if (res.status === 403) {
      throw new Error("Scoreboard not available yet");
    }
    throw new Error("Failed to fetch scoreboard");
  }
  const data = await res.json();
  return mapScoreboardDto(data);
};

export const getClarifications = async (contestId: string): Promise<any[]> => {
  const res = await httpClient.get(
    `/api/v1/contests/${contestId}/clarifications/`
  );
  if (!res.ok) throw new Error("Failed to fetch clarifications");
  return res.json();
};

export const createClarification = async (
  contestId: string,
  data: {
    question: string;
    problem_id?: string;
  }
): Promise<any> => {
  const res = await httpClient.post(
    `/api/v1/contests/${contestId}/clarifications/`,
    data
  );
  if (!res.ok) throw new Error("Failed to create clarification");
  return res.json();
};

export const replyClarification = async (
  contestId: string,
  clarificationId: string,
  reply: string,
  isPublic: boolean
): Promise<any> => {
  const res = await httpClient.post(
    `/api/v1/contests/${contestId}/clarifications/${clarificationId}/reply/`,
    { answer: reply, is_public: isPublic }
  );
  if (!res.ok) throw new Error("Failed to reply to clarification");
  return res.json();
};

export const deleteClarification = async (
  contestId: string,
  clarificationId: string
): Promise<void> => {
  const res = await httpClient.delete(
    `/api/v1/contests/${contestId}/clarifications/${clarificationId}/`
  );
  if (!res.ok) throw new Error("Failed to delete clarification");
};

export const getContestParticipants = async (
  contestId: string
): Promise<ContestParticipant[]> => {
  const res = await httpClient.get(
    `/api/v1/contests/${contestId}/participants/`
  );
  if (!res.ok) throw new Error("Failed to fetch participants");
  const data = await res.json();
  return Array.isArray(data) ? data.map(mapContestParticipantDto) : [];
};

export const unlockParticipant = async (
  contestId: string,
  userId: number
): Promise<void> => {
  const res = await httpClient.post(
    `/api/v1/contests/${contestId}/unlock_participant/`,
    { user_id: userId }
  );
  if (!res.ok) throw new Error("Failed to unlock participant");
};

export const updateNickname = async (
  contestId: string,
  nickname: string
): Promise<any> => {
  const res = await httpClient.post(
    `/api/v1/contests/${contestId}/update_nickname/`,
    { nickname }
  );
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(
      errorData.error || errorData.detail || "Failed to update nickname"
    );
  }
  return res.json();
};

export const updateParticipant = async (
  contestId: string,
  userId: number,
  data: any
): Promise<void> => {
  const res = await httpClient.patch(
    `/api/v1/contests/${contestId}/update_participant/`,
    { user_id: userId, ...data }
  );
  if (!res.ok) throw new Error("Failed to update participant");
};

export const addContestParticipant = async (
  contestId: string,
  username: string
): Promise<void> => {
  const res = await httpClient.post(
    `/api/v1/contests/${contestId}/add_participant/`,
    { username }
  );
  if (!res.ok) throw new Error("Failed to add participant");
};

export const reopenExam = async (
  contestId: string,
  userId: number
): Promise<void> => {
  const res = await httpClient.post(
    `/api/v1/contests/${contestId}/reopen_exam/`,
    { user_id: userId }
  );
  if (!res.ok) throw new Error("Failed to reopen exam");
};

export const removeParticipant = async (
  contestId: string,
  userId: number
): Promise<void> => {
  const res = await httpClient.post(
    `/api/v1/contests/${contestId}/remove_participant/`,
    { user_id: userId }
  );
  if (!res.ok) throw new Error("Failed to remove participant");
};

// ========== Admin Management ==========
export const getContestAdmins = async (
  contestId: string
): Promise<Array<{ id: string; username: string }>> => {
  const res = await httpClient.get(`/api/v1/contests/${contestId}/admins/`);
  if (!res.ok) throw new Error("Failed to fetch admins");
  return res.json();
};

export const addContestAdmin = async (
  contestId: string,
  username: string
): Promise<{ id: string; username: string }> => {
  const res = await httpClient.post(
    `/api/v1/contests/${contestId}/add_admin/`,
    { username }
  );
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || "Failed to add admin");
  }
  const data = await res.json();
  return data.user;
};

export const removeContestAdmin = async (
  contestId: string,
  userId: string
): Promise<void> => {
  const res = await httpClient.post(
    `/api/v1/contests/${contestId}/remove_admin/`,
    { user_id: userId }
  );
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || "Failed to remove admin");
  }
};

/**
 * Export contest results as CSV file download
 */
export const exportContestResults = async (
  contestId: string
): Promise<void> => {
  const token = localStorage.getItem("token");
  const res = await fetch(`/api/v1/contests/${contestId}/export_results/`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    if (res.status === 403) {
      throw new Error("權限不足");
    }
    throw new Error("匯出失敗");
  }

  // Create download
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contest_${contestId}_results.csv`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};

/**
 * Download contest file in specified format (PDF or Markdown)
 * @param scale - PDF scale factor (0.5 to 2.0), only applies to PDF format
 * @param layout - PDF layout mode ('normal' or 'compact'), only applies to PDF format
 */
export const downloadContestFile = async (
  contestId: string,
  format: "pdf" | "markdown" = "markdown",
  language: string = "zh-TW",
  scale: number = 1.0,
  layout: "normal" | "compact" = "normal"
): Promise<Blob> => {
  const token = localStorage.getItem("token");

  // Build query params
  const params = new URLSearchParams({
    file_format: format,
    language: language,
  });

  // Only add scale and layout params for PDF format
  if (format === "pdf") {
    if (scale !== 1.0) {
      if (scale < 0.5 || scale > 2.0) {
        throw new Error("Scale must be between 0.5 and 2.0");
      }
      params.append("scale", scale.toString());
    }
    if (layout !== "normal") {
      params.append("layout", layout);
    }
  }

  // Use direct fetch instead of httpClient to set correct Accept header for binary downloads
  const res = await fetch(
    `/api/v1/contests/${contestId}/download/?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
        // Use */* to bypass DRF content negotiation (DRF doesn't have renderers for text/markdown or application/pdf)
        Accept: "*/*",
      },
    }
  );

  if (!res.ok) {
    // Try to parse error response
    try {
      const errorData = await res.json();
      // Handle nested error format: { success: false, error: { code, message } }
      const message =
        errorData.error?.message ||
        errorData.message ||
        errorData.detail ||
        "Failed to download contest file";
      throw new Error(message);
    } catch (parseError) {
      // If can't parse JSON, throw generic error with status
      throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    }
  }

  return res.blob();
};

/**
 * Download individual participant's exam report as PDF (Admin only)
 * @param contestId - Contest ID
 * @param userId - Target user ID
 * @param language - Report language (default: zh-TW)
 * @param scale - PDF scale factor (0.5 to 2.0, default 1.0)
 */
export const downloadParticipantReport = async (
  contestId: string,
  userId: string | number,
  language: string = "zh-TW",
  scale: number = 1.0
): Promise<void> => {
  const token = localStorage.getItem("token");

  const params = new URLSearchParams({
    language: language,
  });

  if (scale !== 1.0) {
    if (scale < 0.5 || scale > 2.0) {
      throw new Error("Scale must be between 0.5 and 2.0");
    }
    params.append("scale", scale.toString());
  }

  const res = await fetch(
    `/api/v1/contests/${contestId}/participants/${userId}/report/?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
        Accept: "*/*",
      },
    }
  );

  if (!res.ok) {
    try {
      const errorData = await res.json();
      const message =
        errorData.error?.message ||
        errorData.error ||
        errorData.message ||
        errorData.detail ||
        "Failed to download report";
      throw new Error(message);
    } catch {
      throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    }
  }

  // Download the file
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;

  // Extract filename from Content-Disposition header or use default
  const contentDisposition = res.headers.get("Content-Disposition");
  let filename = `report_${contestId}_${userId}.pdf`;
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?(.+)"?/);
    if (match) {
      filename = match[1].replace(/"/g, "");
    }
  }

  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};

/**
 * Download current user's own exam report as PDF (Student only, after submission)
 * @param contestId - Contest ID
 * @param language - Report language (default: zh-TW)
 * @param scale - PDF scale factor (0.5 to 2.0, default 1.0)
 */
export const downloadMyReport = async (
  contestId: string,
  language: string = "zh-TW",
  scale: number = 1.0
): Promise<void> => {
  const token = localStorage.getItem("token");

  const params = new URLSearchParams({
    language: language,
  });

  if (scale !== 1.0) {
    if (scale < 0.5 || scale > 2.0) {
      throw new Error("Scale must be between 0.5 and 2.0");
    }
    params.append("scale", scale.toString());
  }

  const res = await fetch(
    `/api/v1/contests/${contestId}/my_report/?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
        Accept: "*/*",
      },
    }
  );

  if (!res.ok) {
    try {
      const errorData = await res.json();
      const message =
        errorData.error?.message ||
        errorData.error ||
        errorData.message ||
        errorData.detail ||
        "Failed to download report";
      throw new Error(message);
    } catch {
      throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    }
  }

  // Download the file
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;

  // Extract filename from Content-Disposition header or use default
  const contentDisposition = res.headers.get("Content-Disposition");
  let filename = `my_report_${contestId}.pdf`;
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?(.+)"?/);
    if (match) {
      filename = match[1].replace(/"/g, "");
    }
  }

  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};

export default {
  getContests,
  getContest,
  getContestProblem,
  createContest,
  updateContest,
  toggleStatus,
  deleteContest,
  registerContest,
  enterContest,
  leaveContest,
  getContestAnnouncements,
  createContestAnnouncement,
  deleteContestAnnouncement,
  getContestStandings,
  addContestProblem,
  createContestProblem,
  removeContestProblem,
  endContest,
  publishProblemToPractice,
  getContestQuestions,
  createContestQuestion,
  answerContestQuestion,
  archiveContest,
  startExam,
  endExam,
  recordExamEvent,
  getExamEvents,
  getScoreboard,
  getClarifications,
  createClarification,
  replyClarification,
  deleteClarification,
  getContestParticipants,
  unlockParticipant,
  updateParticipant,
  addContestParticipant,
  reopenExam,
  reorderContestProblems,
  exportContestResults,
  downloadContestFile,
  downloadParticipantReport,
  downloadMyReport,
};
