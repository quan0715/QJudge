/**
 * Classroom Repository Implementation
 */

import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import type {
  Classroom,
  ClassroomDetail,
} from "@/core/entities/classroom.entity";
import {
  mapClassroomDto,
  mapClassroomDetailDto,
} from "@/infrastructure/mappers/classroom.mapper";

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
  if (!res.ok) return undefined;
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
  data: { name?: string; description?: string; invite_code_enabled?: boolean }
): Promise<Classroom> => {
  const responseData = await requestJson<any>(
    httpClient.patch(`/api/v1/classrooms/${id}/`, data),
    "Failed to update classroom"
  );
  return mapClassroomDto(responseData);
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
      contest_id: Number(contestId),
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
      contest_id: Number(contestId),
    }),
    "Failed to unbind contest"
  );
};
