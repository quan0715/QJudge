import type {
  LiveGrant,
  LiveRole,
  LiveSource,
  LiveTargetSnapshot,
} from "@/core/entities/liveMonitoring.entity";
import { httpClient, requestJson } from "@/infrastructure/api/http.client";

interface LiveMonitoringConfig {
  enabled: boolean;
  configured: boolean;
  provider: "livekit" | "disabled";
}

interface LiveMonitoringUploadScope {
  runId: string;
  participantId: number | string;
  attemptId: string;
  deviceId: string;
}

interface LiveMonitoringTokenRequest {
  role: LiveRole;
  uploadScope?: LiveMonitoringUploadScope;
  signal?: AbortSignal;
}

interface LiveMonitoringConfigDto {
  enabled: boolean;
  configured: boolean;
  provider: string;
}

interface LiveGrantDto {
  server_url: string;
  token: string;
  room_name: string;
  identity: string;
  run_id: string | number;
  role: LiveRole;
  allowed_sources: unknown;
  expires_at: string;
}

interface LiveTargetDto {
  user_id: string | number;
  identity: string;
  sources: unknown;
}

interface LiveTargetSnapshotDto {
  observed_at?: string | null;
  stale?: boolean;
  targets?: unknown;
}

const apiPath = (contestId: string, suffix: string): string =>
  `/api/v1/contests/${encodeURIComponent(contestId)}/exam/live/${suffix}/`;

const source = (value: unknown): LiveSource | null =>
  value === "screen_share" || value === "webcam" ? value : null;

const sources = (value: unknown): LiveSource[] =>
  Array.isArray(value)
    ? value.flatMap((item) => {
        const normalized = source(item);
        return normalized ? [normalized] : [];
      })
    : [];

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value) {
    throw new Error(`Invalid live monitoring response: ${field}`);
  }
  return value;
};

const mapGrant = (dto: LiveGrantDto): LiveGrant => ({
  serverUrl: requiredString(dto.server_url, "server_url"),
  token: requiredString(dto.token, "token"),
  roomName: requiredString(dto.room_name, "room_name"),
  identity: requiredString(dto.identity, "identity"),
  runId: dto.run_id === undefined || dto.run_id === null || dto.run_id === ""
    ? (() => {
        throw new Error("Invalid live monitoring response: run_id");
      })()
    : String(dto.run_id),
  role: dto.role === "publisher" || dto.role === "subscriber"
    ? dto.role
    : (() => {
        throw new Error("Invalid live monitoring response: role");
      })(),
  allowedSources: sources(dto.allowed_sources),
  expiresAt: requiredString(dto.expires_at, "expires_at"),
});

const mapTarget = (value: unknown): LiveTargetSnapshot["targets"][number] | null => {
  if (!value || typeof value !== "object") return null;
  const dto = value as Partial<LiveTargetDto>;
  if (dto.user_id === undefined || typeof dto.identity !== "string" || !dto.identity) {
    return null;
  }
  return {
    userId: String(dto.user_id),
    identity: dto.identity,
    sources: sources(dto.sources),
  };
};

export const getLiveMonitoringConfig = async (
  contestId: string,
  signal?: AbortSignal,
): Promise<LiveMonitoringConfig> => {
  const dto = await requestJson<LiveMonitoringConfigDto>(
    httpClient.get(apiPath(contestId, "config"), { signal }),
    "Failed to fetch live monitoring config",
  );
  return {
    enabled: dto.enabled === true,
    configured: dto.configured === true,
    provider: dto.provider === "livekit" ? "livekit" : "disabled",
  };
};

export const requestLiveMonitoringToken = async (
  contestId: string,
  request: LiveMonitoringTokenRequest,
): Promise<LiveGrant> => {
  const body: Record<string, unknown> = { role: request.role };
  if (request.uploadScope) {
    body.upload_scope = {
      run_id: request.uploadScope.runId,
      participant_id: request.uploadScope.participantId,
      attempt_id: request.uploadScope.attemptId,
      device_id: request.uploadScope.deviceId,
    };
  }
  const dto = await requestJson<LiveGrantDto>(
    httpClient.requestOnce(apiPath(contestId, "token"), {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      signal: request.signal,
    }),
    "Failed to request live monitoring token",
  );
  return mapGrant(dto);
};

export const getLiveMonitoringTargets = async (
  contestId: string,
  signal?: AbortSignal,
): Promise<LiveTargetSnapshot> => {
  const dto = await requestJson<LiveTargetSnapshotDto>(
    httpClient.get(apiPath(contestId, "targets"), { signal }),
    "Failed to fetch live monitoring targets",
  );
  const targetValues = Array.isArray(dto.targets) ? dto.targets : [];
  return {
    observedAt: typeof dto.observed_at === "string" ? dto.observed_at : null,
    stale: dto.stale === true,
    targets: targetValues.flatMap((value) => {
      const target = mapTarget(value);
      return target ? [target] : [];
    }),
  };
};
