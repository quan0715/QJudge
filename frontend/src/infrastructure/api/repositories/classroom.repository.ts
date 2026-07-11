import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import type {
  BoundContest,
  Classroom,
  ClassroomAnnouncement,
  ClassroomDetail,
} from "@/core/entities/classroom.entity";
import {
  mapClassroomAnnouncementDto,
  mapBoundContestDto,
  mapClassroomDto,
  mapClassroomDetailDto,
} from "@/infrastructure/mappers/classroom.mapper";
import type {
  BoundContestDto,
  ClassroomAnnouncementDto,
  ClassroomDto,
  ClassroomDetailDto,
} from "@/infrastructure/api/dto/classroom.dto";

// ============================================================================
// Classroom Repository Implementation
// ============================================================================

export const getClassrooms = async (scope?: string): Promise<Classroom[]> => {
  const query = scope ? `?scope=${scope}` : "";
  const data = await requestJson<{ results?: ClassroomDto[] } | ClassroomDto[]>(
    httpClient.get(`/api/v1/classrooms/${query}`),
    "Failed to fetch classrooms"
  );
  const results = Array.isArray(data) ? data : data.results || [];
  return results.map(mapClassroomDto);
};

export const getClassroom = async (id: string): Promise<ClassroomDetail | undefined> => {
  const res = await httpClient.get(`/api/v1/classrooms/${id}/`);
  if (!res.ok) return undefined;
  const data = await res.json() as ClassroomDetailDto;
  return mapClassroomDetailDto(data);
};

export const createClassroom = async (data: { name: string; description?: string }): Promise<Classroom> => {
  const responseData = await requestJson<ClassroomDto>(
    httpClient.post(`/api/v1/classrooms/`, data),
    "Failed to create classroom"
  );
  return mapClassroomDto(responseData);
};

export const updateClassroom = async (id: string, data: { name?: string; description?: string; icon?: string; cover_url?: string }): Promise<Classroom> => {
  const responseData = await requestJson<ClassroomDto>(
    httpClient.patch(`/api/v1/classrooms/${id}/`, data),
    "Failed to update classroom"
  );
  return mapClassroomDto(responseData);
};

export const deleteClassroom = async (id: string): Promise<void> => {
  await ensureOk(httpClient.delete(`/api/v1/classrooms/${id}/`), "Failed to delete classroom");
};

export interface RegenerateInviteCodeResponse {
  invite_code: string;
}

export interface AddClassroomMembersResponse {
  added: string[];
  already_exists: string[];
  not_found: string[];
}

export interface UpdateMemberRoleResponse {
  detail: string;
}

export const regenerateCode = async (id: string): Promise<RegenerateInviteCodeResponse> => {
  return requestJson<RegenerateInviteCodeResponse>(
    httpClient.post(`/api/v1/classrooms/${id}/invite-code/`),
    "Failed to regenerate code"
  );
};

export const addMembers = async (id: string, usernames: string[]): Promise<AddClassroomMembersResponse> => {
  return requestJson<AddClassroomMembersResponse>(
    httpClient.post(`/api/v1/classrooms/${id}/members/`, { usernames }),
    "Failed to add members"
  );
};

export const removeMember = async (classroomId: string, userId: number): Promise<void> => {
  await ensureOk(
    httpClient.delete(`/api/v1/classrooms/${classroomId}/members/${userId}/`),
    "Failed to remove member"
  );
};

export const updateMemberRole = async (classroomId: string, userId: number, role: string): Promise<UpdateMemberRoleResponse> => {
  return requestJson<UpdateMemberRoleResponse>(
    httpClient.patch(`/api/v1/classrooms/${classroomId}/members/${userId}/`, { role }),
    "Failed to update member role"
  );
};

export const uploadClassroomCover = async (id: string, file: File): Promise<string> => {
  const formData = new FormData();
  formData.append("file", file);
  const data = await requestJson<{ cover_url: string }>(
    httpClient.request(`/api/v1/classrooms/${id}/cover/`, {
      method: "POST",
      body: formData,
    }),
    "Failed to upload cover"
  );
  return data.cover_url;
};

// Announcement operations
export const getAnnouncements = async (classroomId: string): Promise<ClassroomAnnouncement[]> => {
  const data = await requestJson<ClassroomAnnouncementDto[]>(
    httpClient.get(`/api/v1/classrooms/${classroomId}/announcements/`)
  );
  return data.map(mapClassroomAnnouncementDto);
};

export const createAnnouncement = async (classroomId: string, data: { title: string; content: string; is_pinned?: boolean }): Promise<ClassroomAnnouncement> => {
  const responseData = await requestJson<ClassroomAnnouncementDto>(
    httpClient.post(`/api/v1/classrooms/${classroomId}/announcements/`, data),
    "Failed to create announcement"
  );
  return mapClassroomAnnouncementDto(responseData);
};

export const updateAnnouncement = async (classroomId: string, announcementId: string, data: { title?: string; content?: string; is_pinned?: boolean }): Promise<ClassroomAnnouncement> => {
  const responseData = await requestJson<ClassroomAnnouncementDto>(
    httpClient.patch(`/api/v1/classrooms/${classroomId}/announcements/${announcementId}/`, data),
    "Failed to update announcement"
  );
  return mapClassroomAnnouncementDto(responseData);
};

export const deleteAnnouncement = async (classroomId: string, announcementId: string): Promise<void> => {
  await ensureOk(
    httpClient.delete(`/api/v1/classrooms/${classroomId}/announcements/${announcementId}/`),
    "Failed to delete announcement"
  );
};

// Contest operations
export const getClassroomContests = async (id: string): Promise<BoundContest[]> => {
  const data = await requestJson<BoundContestDto[]>(httpClient.get(`/api/v1/classrooms/${id}/contests/`));
  return data.map(mapBoundContestDto);
};

export const createClassroomContest = async (
  id: string,
  data: {
    name: string;
    description?: string;
    start_time?: string;
    end_time?: string;
    contest_type: "coding" | "paper_exam";
    attendance_check_enabled?: boolean;
    cheat_detection_enabled?: boolean;
    allow_multiple_joins?: boolean;
    results_published?: boolean;
  },
): Promise<BoundContest> => {
  const responseData = await requestJson<BoundContestDto>(
    httpClient.post(`/api/v1/classrooms/${id}/contests/`, data),
    "Failed to create classroom contest",
  );
  return mapBoundContestDto(responseData);
};

// ============================================================================
// Repository Export
// ============================================================================

export const classroomRepository = {
  getClassrooms,
  getClassroom,
  createClassroom,
  updateClassroom,
  deleteClassroom,
  regenerateCode,
  addMembers,
  removeMember,
  updateMemberRole,
  uploadClassroomCover,
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  getClassroomContests,
  createClassroomContest,
};

export default classroomRepository;
