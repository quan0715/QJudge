import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import type { Classroom, ClassroomDetail } from "@/core/entities/classroom.entity";
import { mapClassroomDto, mapClassroomDetailDto } from "@/infrastructure/mappers/classroom.mapper";
import type { ClassroomDto, ClassroomDetailDto } from "@/infrastructure/api/dto/classroom.dto";

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

export const joinClassroom = async (inviteCode: string): Promise<ClassroomDetail> => {
  const data = await requestJson<ClassroomDetailDto>(
    httpClient.post(`/api/v1/classrooms/join/`, { invite_code: inviteCode }),
    "Failed to join classroom"
  );
  return mapClassroomDetailDto(data);
};

export const archiveClassroom = async (id: string): Promise<void> => {
  await ensureOk(httpClient.post(`/api/v1/classrooms/${id}/archive/`), "Failed to archive classroom");
};

export const toggleInviteCode = async (id: string, enabled: boolean): Promise<{ enabled: boolean; invite_code: string | null }> => {
  return requestJson<{ enabled: boolean; invite_code: string | null }>(
    httpClient.post(`/api/v1/classrooms/${id}/toggle_invite_code/`, { enabled }),
    "Failed to toggle invite code"
  );
};

export const regenerateCode = async (id: string): Promise<any> => {
  return requestJson<any>(
    httpClient.post(`/api/v1/classrooms/${id}/toggle_invite_code/`, { enabled: true }),
    "Failed to regenerate code"
  );
};

export const addMembers = async (id: string, usernames: string[]): Promise<any> => {
  return requestJson<any>(
    httpClient.post(`/api/v1/classrooms/${id}/add_members/`, { usernames }),
    "Failed to add members"
  );
};

export const removeMember = async (classroomId: string, userId: number): Promise<void> => {
  await ensureOk(
    httpClient.post(`/api/v1/classrooms/${classroomId}/remove_member/`, { user_id: userId }),
    "Failed to remove member"
  );
};

export const updateMemberRole = async (classroomId: string, userId: number, role: string): Promise<any> => {
  return requestJson<any>(
    httpClient.patch(`/api/v1/classrooms/${classroomId}/members/${userId}/`, { role }),
    "Failed to update member role"
  );
};

export const uploadClassroomCover = async (id: string, file: File): Promise<string> => {
  const formData = new FormData();
  formData.append("file", file);
  const data = await requestJson<{ cover_url: string }>(
    httpClient.post(`/api/v1/classrooms/${id}/upload_cover/`, formData),
    "Failed to upload cover"
  );
  return data.cover_url;
};

// Announcement operations
export const getAnnouncements = async (classroomId: string): Promise<any[]> => {
  return requestJson<any[]>(httpClient.get(`/api/v1/classrooms/${classroomId}/announcements/`));
};

export const createAnnouncement = async (classroomId: string, data: { title: string; content: string; is_pinned?: boolean }): Promise<any> => {
  return requestJson<any>(
    httpClient.post(`/api/v1/classrooms/${classroomId}/announcements/`, data),
    "Failed to create announcement"
  );
};

export const updateAnnouncement = async (classroomId: string, announcementId: string, data: { title?: string; content?: string; is_pinned?: boolean }): Promise<any> => {
  return requestJson<any>(
    httpClient.patch(`/api/v1/classrooms/${classroomId}/announcements/${announcementId}/`, data),
    "Failed to update announcement"
  );
};

export const deleteAnnouncement = async (classroomId: string, announcementId: string): Promise<void> => {
  await ensureOk(
    httpClient.delete(`/api/v1/classrooms/${classroomId}/announcements/${announcementId}/`),
    "Failed to delete announcement"
  );
};

// Lab operations
export const getClassroomLabs = async (id: string): Promise<any> => {
  return requestJson<any>(httpClient.get(`/api/v1/classrooms/${id}/labs/`));
};

export const createClassroomLab = async (id: string, data: any): Promise<any> => {
  return requestJson<any>(httpClient.post(`/api/v1/classrooms/${id}/labs/`, data));
};

export const getClassroomLab = async (classroomId: string, labId: string): Promise<any> => {
  return requestJson<any>(httpClient.get(`/api/v1/classrooms/${classroomId}/labs/${labId}/`));
};

export const acceptClassroomLab = async (classroomId: string, labId: string): Promise<any> => {
  return requestJson<any>(httpClient.post(`/api/v1/classrooms/${classroomId}/labs/${labId}/accept/`));
};

export const getClassroomLabSolve = async (classroomId: string, labId: string): Promise<any> => {
  return requestJson<any>(httpClient.get(`/api/v1/classrooms/${classroomId}/labs/${labId}/solve/`));
};

// Contest operations
export const getClassroomContests = async (id: string): Promise<any> => {
  return requestJson<any>(httpClient.get(`/api/v1/classrooms/${id}/contests/`));
};

export const createClassroomContest = async (id: string, data: any): Promise<any> => {
  return requestJson<any>(httpClient.post(`/api/v1/classrooms/${id}/contests/`, data));
};

export const bindContest = async (classroomId: string, contestId: string): Promise<any> => {
  return requestJson<any>(
    httpClient.post(`/api/v1/classrooms/${classroomId}/bind_contest/`, { contest_id: contestId }),
    "Failed to bind contest"
  );
};

export const unbindContest = async (classroomId: string, contestId: string): Promise<void> => {
  await ensureOk(
    httpClient.post(`/api/v1/classrooms/${classroomId}/unbind_contest/`, { contest_id: contestId }),
    "Failed to unbind contest"
  );
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
  joinClassroom,
  archiveClassroom,
  toggleInviteCode,
  regenerateCode,
  addMembers,
  removeMember,
  updateMemberRole,
  uploadClassroomCover,
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  getClassroomLabs,
  createClassroomLab,
  getClassroomLab,
  acceptClassroomLab,
  getClassroomLabSolve,
  getClassroomContests,
  createClassroomContest,
  bindContest,
  unbindContest,
};

export default classroomRepository;
