/**
 * Contest Repository Implementation
 *
 * Main contest operations including CRUD, registration, and scoreboard.
 */

import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import type {
  Contest,
  ContestDetail,
  ScoreboardData,
} from "@/core/entities/contest.entity";
import type {
  IContestRepository,
  ContestCreatePayload,
  ContestUpdatePayload,
} from "@/core/ports/contest.repository";
import {
  mapContestDto,
  mapContestDetailDto,
  mapScoreboardDto,
  mapContestUpdateRequestToDto,
} from "@/infrastructure/mappers/contest.mapper";

// ============================================================================
// Contest Repository Implementation
// ============================================================================

export const getContests = async (scope?: string): Promise<Contest[]> => {
  const query = scope ? `?scope=${scope}` : "";
  const data = await requestJson<any>(
    httpClient.get(`/api/v1/contests/${query}`),
    "Failed to fetch contests"
  );
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

export const createContest = async (
  data: ContestCreatePayload
): Promise<Contest> => {
  const responseData = await requestJson<any>(
    httpClient.post("/api/v1/contests/", data),
    "Failed to create contest"
  );
  return mapContestDto(responseData);
};

export const updateContest = async (
  id: string,
  data: ContestUpdatePayload
): Promise<Contest> => {
  const payload = mapContestUpdateRequestToDto(data);
  const responseData = await requestJson<any>(
    httpClient.patch(`/api/v1/contests/${id}/`, payload),
    "Failed to update contest"
  );
  return mapContestDto(responseData);
};

export const deleteContest = async (id: string): Promise<void> => {
  await ensureOk(
    httpClient.delete(`/api/v1/contests/${id}/`),
    "Failed to delete contest"
  );
};

export const toggleStatus = async (
  id: string
): Promise<{ status: string }> => {
  return requestJson<{ status: string }>(
    httpClient.post(`/api/v1/contests/${id}/toggle_status/`),
    "Failed to toggle contest status"
  );
};

export const registerContest = async (
  id: string,
  data?: { password?: string; nickname?: string }
): Promise<void> => {
  await requestJson<any>(
    httpClient.post(`/api/v1/contests/${id}/register/`, data),
    "Registration failed"
  );
};

export const enterContest = async (id: string): Promise<void> => {
  await requestJson<any>(
    httpClient.post(`/api/v1/contests/${id}/enter/`),
    "Failed to enter contest"
  );
};

export const leaveContest = async (id: string): Promise<void> => {
  await requestJson<any>(
    httpClient.post(`/api/v1/contests/${id}/leave/`),
    "Failed to leave contest"
  );
};

export const endContest = async (id: string): Promise<void> => {
  await requestJson<any>(
    httpClient.post(`/api/v1/contests/${id}/end_contest/`),
    "Failed to end contest"
  );
};

export const archiveContest = async (id: string): Promise<void> => {
  await ensureOk(
    httpClient.post(`/api/v1/contests/${id}/archive/`),
    "Failed to archive contest"
  );
};

export const getContestStandings = async (
  id: string
): Promise<ScoreboardData> => {
  const data = await requestJson<any>(
    httpClient.get(`/api/v1/contests/${id}/standings/`),
    "Failed to fetch standings"
  );
  return mapScoreboardDto(data);
};

export const getScoreboard = async (
  contestId: string
): Promise<ScoreboardData> => {
  const res = await httpClient.get(`/api/v1/contests/${contestId}/standings/`);
  if (!res.ok) {
    if (res.status === 403) {
      throw new Error("Scoreboard not available yet");
    }
    const errorData = await res.json().catch(() => null);
    throw new Error(errorData?.detail || "Failed to fetch scoreboard");
  }
  const data = await res.json();
  return mapScoreboardDto(data);
};

// ============================================================================
// Repository Instance (implements IContestRepository)
// ============================================================================

export const contestRepository: IContestRepository = {
  getContests,
  getContest,
  createContest,
  updateContest,
  deleteContest,
  toggleStatus,
  registerContest,
  enterContest,
  leaveContest,
  endContest,
  archiveContest,
  getContestStandings,
  getScoreboard,
};

export default contestRepository;
