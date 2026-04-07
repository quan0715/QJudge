/**
 * Contest Repository Implementation
 *
 * Main contest operations including CRUD, registration, and scoreboard.
 */

import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import type {
  Contest,
  ContestAnticheatConfig,
  ContestDetail,
  ContestOverviewMetrics,
  ScoreboardData,
} from "@/core/entities/contest.entity";
import type {
  IContestRepository,
  ContestUpdatePayload,
} from "@/core/ports/contest.repository";
import {
  mapContestDto,
  mapContestDetailDto,
  mapScoreboardDto,
  mapContestUpdateRequestToDto,
  mapContestAnticheatConfigDto,
  mapContestOverviewMetricsDto,
} from "@/infrastructure/mappers/contest.mapper";
import type {
  ContestDto,
  ContestDetailDto,
  ScoreboardDto,
  ContestOverviewMetricsDto,
} from "@/infrastructure/api/dto/contest.dto";

// ============================================================================
// Contest Repository Implementation
// ============================================================================

export const getContests = async (scope?: string): Promise<Contest[]> => {
  const query = scope ? `?scope=${scope}` : "";
  const data = await requestJson<{ results?: ContestDto[] } | ContestDto[]>(
    httpClient.get(`/api/v1/contests/${query}`),
    "Failed to fetch contests"
  );
  const results = Array.isArray(data) ? data : data.results || [];
  return results.map(mapContestDto);
};

export const getContest = async (
  id: string
): Promise<ContestDetail | undefined> => {
  const res = await httpClient.get(`/api/v1/contests/${id}/`);
  if (!res.ok) return undefined;
  const data = await res.json() as ContestDetailDto;
  return mapContestDetailDto(data);
};

export const updateContest = async (
  id: string,
  data: ContestUpdatePayload
): Promise<Contest> => {
  const payload = mapContestUpdateRequestToDto(data);
  const responseData = await requestJson<ContestDto>(
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
  await requestJson<void>(
    httpClient.post(`/api/v1/contests/${id}/register/`, data),
    "Registration failed"
  );
};

export const enterContest = async (
  id: string,
  data?: { password?: string },
): Promise<void> => {
  await requestJson<void>(
    httpClient.post(`/api/v1/contests/${id}/enter/`, data ?? {}),
    "Failed to enter contest"
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
  const res = await httpClient.get(`/api/v1/contests/${id}/standings/`);
  if (!res.ok) {
    if (res.status === 403) {
      throw new Error("Scoreboard not available yet");
    }
    const errorData = await res.json().catch(() => null);
    throw new Error(errorData?.detail || "Failed to fetch standings");
  }
  return mapScoreboardDto(await res.json() as ScoreboardDto);
};

export const getContestAnticheatConfig = async (
  id: string
): Promise<ContestAnticheatConfig> => {
  const data = await requestJson<any>( // Config DTO is complex, keeping any for internal parse
    httpClient.get(`/api/v1/contests/${id}/anticheat-config/`),
    "Failed to fetch anti-cheat config"
  );
  return mapContestAnticheatConfigDto(data);
};

export const getContestOverviewMetrics = async (
  id: string
): Promise<ContestOverviewMetrics> => {
  const data = await requestJson<ContestOverviewMetricsDto>(
    httpClient.get(`/api/v1/contests/${id}/overview-metrics/`),
    "Failed to fetch contest overview metrics"
  );
  return mapContestOverviewMetricsDto(data);
};

// ============================================================================
// Repository Instance (implements IContestRepository)
// ============================================================================

export const contestRepository: IContestRepository = {
  getContests,
  getContest,
  updateContest,
  deleteContest,
  toggleStatus,
  registerContest,
  enterContest,
  archiveContest,
  getContestStandings,
  getContestAnticheatConfig,
  getContestOverviewMetrics,
};

export default contestRepository;
