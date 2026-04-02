/**
 * Classroom Repository Implementation
 */

import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import type {
  Classroom,
  ClassroomDetail,
  ClassroomAnnouncement,
  ClassroomLabDetail,
  ClassroomLabSummary,
  BoundContest,
} from "@/core/entities/classroom.entity";
import {
  mapClassroomDto,
  mapClassroomDetailDto,
  mapClassroomAnnouncementDto,
  mapClassroomLabSummaryDto,
  mapBoundContestDto,
} from "@/infrastructure/mappers/classroom.mapper";
import { mapContestDetailDto } from "@/infrastructure/mappers/contest.mapper";

export const getClassrooms = async (
  scope?: "manage" | "enrolled" | "all"
): Promise<Classroom[]> => {
  const query = scope ? `?scope=${scope}` : "";
  const data = await requestJson<any>(
    httpClient.get(`/api/v1/classrooms/${query}`),
    "Failed to fetch classrooms"
  );
  const results = data.results || data;
  return Array.isArray(results) ? results.map(mapClassroomDto) : [];
};

export const getClassroom = async (
  id: string
): Promise<ClassroomDetail | undefined> => {
  const res = await httpClient.get(`/api/v1/classrooms/${id}/`);
  if (res.status === 404) return undefined;
  if (!res.ok) {
    let message = `Failed to fetch classroom (${res.status})`;
    try {
      const data = await res.json();
      message =
        data?.detail ||
        data?.message ||
        data?.error ||
        message;
    } catch {
      // keep fallback message
    }
    throw new Error(message);
  }
  const data = await res.json();
  return mapClassroomDetailDto(data);
};

export const createClassroom = async (data: {
  name: string;
  description?: string;
}): Promise<Classroom> => {
  const responseData = await requestJson<any>(
    httpClient.post("/api/v1/classrooms/", data),
    "Failed to create classroom"
  );
  return mapClassroomDto(responseData);
};

export const updateClassroom = async (
  id: string,
  data: { name?: string; description?: string; invite_code_enabled?: boolean; icon?: string; cover_url?: string }
): Promise<Classroom> => {
  const responseData = await requestJson<any>(
    httpClient.patch(`/api/v1/classrooms/${id}/`, data),
    "Failed to update classroom"
  );
  return mapClassroomDto(responseData);
};

export const uploadClassroomCover = async (
  id: string,
  file: File
): Promise<string> => {
  const formData = new FormData();
  formData.append("file", file);
  const data = await requestJson<{ cover_url: string }>(
    httpClient.request(`/api/v1/classrooms/${id}/upload_cover/`, {
      method: "POST",
      body: formData,
    }),
    "Failed to upload cover image"
  );
  return data.cover_url;
};

export const deleteClassroom = async (id: string): Promise<void> => {
  await ensureOk(
    httpClient.delete(`/api/v1/classrooms/${id}/`),
    "Failed to archive classroom"
  );
};

export const joinClassroom = async (
  inviteCode: string
): Promise<ClassroomDetail> => {
  const data = await requestJson<any>(
    httpClient.post("/api/v1/classrooms/join/", { invite_code: inviteCode }),
    "Failed to join classroom"
  );
  return mapClassroomDetailDto(data);
};

export const addMembers = async (
  classroomId: string,
  usernames: string[],
  role: "student" | "ta" = "student"
): Promise<{ added: string[]; already_exists: string[]; not_found: string[] }> => {
  return requestJson(
    httpClient.post(`/api/v1/classrooms/${classroomId}/add_members/`, {
      usernames,
      role,
    }),
    "Failed to add members"
  );
};

export const removeMember = async (
  classroomId: string,
  userId: number
): Promise<void> => {
  await ensureOk(
    httpClient.post(`/api/v1/classrooms/${classroomId}/remove_member/`, {
      user_id: userId,
    }),
    "Failed to remove member"
  );
};

export const updateMemberRole = async (
  classroomId: string,
  userId: number,
  role: "student" | "ta"
): Promise<void> => {
  await ensureOk(
    httpClient.post(`/api/v1/classrooms/${classroomId}/update_member_role/`, {
      user_id: userId,
      role,
    }),
    "Failed to update member role"
  );
};

export const regenerateCode = async (
  classroomId: string
): Promise<{ invite_code: string }> => {
  return requestJson(
    httpClient.post(`/api/v1/classrooms/${classroomId}/regenerate_code/`),
    "Failed to regenerate invite code"
  );
};

export const bindContest = async (
  classroomId: string,
  contestId: string
): Promise<{ detail: string }> => {
  return requestJson(
    httpClient.post(`/api/v1/classrooms/${classroomId}/bind_contest/`, {
      contest_id: contestId,
    }),
    "Failed to bind contest"
  );
};

export const unbindContest = async (
  classroomId: string,
  contestId: string
): Promise<void> => {
  await ensureOk(
    httpClient.post(`/api/v1/classrooms/${classroomId}/unbind_contest/`, {
      contest_id: contestId,
    }),
    "Failed to unbind contest"
  );
};

export const getClassroomLabs = async (
  classroomId: string
): Promise<ClassroomLabSummary[]> => {
  const data = await requestJson<any[]>(
    httpClient.get(`/api/v1/classrooms/${classroomId}/labs/`),
    "Failed to fetch labs"
  );
  return data.map(mapClassroomLabSummaryDto);
};

export const getClassroomContests = async (
  classroomId: string
): Promise<BoundContest[]> => {
  const data = await requestJson<any[]>(
    httpClient.get(`/api/v1/classrooms/${classroomId}/contests/`),
    "Failed to fetch classroom contests"
  );
  return data.map(mapBoundContestDto);
};

export const createClassroomContest = async (
  classroomId: string,
  data: {
    name: string;
    description?: string;
    contest_type: "coding" | "paper_exam";
    start_time?: string | null;
    end_time?: string | null;
    requires_password?: boolean;
    visibility?: "public" | "private";
    password?: string;
    cheat_detection_enabled?: boolean;
    allow_multiple_joins?: boolean;
    results_published?: boolean;
  }
): Promise<BoundContest> => {
  const res = await requestJson<any>(
    httpClient.post(`/api/v1/classrooms/${classroomId}/contests/`, data),
    "Failed to create classroom contest"
  );
  return mapBoundContestDto(res);
};

export const createClassroomLab = async (
  classroomId: string,
  data: {
    name: string;
    description?: string;
    contest_type: "coding" | "paper_exam";
    start_time?: string | null;
    end_time?: string | null;
    results_published?: boolean;
  }
): Promise<ClassroomLabDetail> => {
  const res = await requestJson<any>(
    httpClient.post(`/api/v1/classrooms/${classroomId}/labs/`, data),
    "Failed to create lab"
  );
  return {
    ...mapClassroomLabSummaryDto(res),
    contest: mapContestDetailDto(res.contest),
  };
};

export const getClassroomLab = async (
  classroomId: string,
  labId: string
): Promise<ClassroomLabDetail> => {
  const res = await requestJson<any>(
    httpClient.get(`/api/v1/classrooms/${classroomId}/labs/${labId}/`),
    "Failed to fetch lab"
  );
  return {
    ...mapClassroomLabSummaryDto(res),
    contest: mapContestDetailDto(res.contest),
  };
};

export const acceptClassroomLab = async (
  classroomId: string,
  labId: string
): Promise<ClassroomLabDetail> => {
  const res = await requestJson<any>(
    httpClient.post(`/api/v1/classrooms/${classroomId}/labs/${labId}/accept/`),
    "Failed to accept lab"
  );
  return {
    ...mapClassroomLabSummaryDto(res),
    contest: mapContestDetailDto(res.contest),
  };
};

export const getClassroomLabSolve = async (
  classroomId: string,
  labId: string
): Promise<ClassroomLabDetail> => {
  const res = await requestJson<any>(
    httpClient.get(`/api/v1/classrooms/${classroomId}/labs/${labId}/solve/`),
    "Failed to load lab solving data"
  );
  return {
    ...mapClassroomLabSummaryDto(res),
    contest: mapContestDetailDto(res.contest),
  };
};

// ── Announcements ───────────────────────────────────────

export const getAnnouncements = async (
  classroomId: string
): Promise<ClassroomAnnouncement[]> => {
  const data = await requestJson<any[]>(
    httpClient.get(`/api/v1/classrooms/${classroomId}/announcements/`),
    "Failed to fetch announcements"
  );
  return data.map(mapClassroomAnnouncementDto);
};

export const createAnnouncement = async (
  classroomId: string,
  data: { title: string; content: string; is_pinned?: boolean }
): Promise<ClassroomAnnouncement> => {
  const res = await requestJson<any>(
    httpClient.post(
      `/api/v1/classrooms/${classroomId}/announcements/create/`,
      data
    ),
    "Failed to create announcement"
  );
  return mapClassroomAnnouncementDto(res);
};

export const updateAnnouncement = async (
  classroomId: string,
  annId: string,
  data: { title?: string; content?: string; is_pinned?: boolean }
): Promise<ClassroomAnnouncement> => {
  const res = await requestJson<any>(
    httpClient.patch(
      `/api/v1/classrooms/${classroomId}/announcements/${annId}/`,
      data
    ),
    "Failed to update announcement"
  );
  return mapClassroomAnnouncementDto(res);
};

export const deleteAnnouncement = async (
  classroomId: string,
  annId: string
): Promise<void> => {
  await ensureOk(
    httpClient.delete(
      `/api/v1/classrooms/${classroomId}/announcements/${annId}/delete/`
    ),
    "Failed to delete announcement"
  );
};
