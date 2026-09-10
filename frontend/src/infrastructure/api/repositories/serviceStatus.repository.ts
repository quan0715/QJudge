import { httpClient, requestJson } from "@/infrastructure/api/http.client";
import type {
  ServiceComponent,
  ServiceStatusReport,
} from "@/core/entities/serviceStatus.entity";

interface ServiceComponentDto {
  id: string;
  status: string;
  detail: string;
  latency_ms: number | null;
}

interface ServiceStatusReportDto {
  generated_at: string;
  components: ServiceComponentDto[];
  integrity: {
    live_run_count: number;
    unhealthy_run_count: number;
    stale_heartbeat_count: number;
    never_reported_count: number;
    heartbeat_stale_after_seconds: number;
    unhealthy_runs: Array<{
      id: string;
      contest_id: string;
      session_state: string;
      data_state: string;
      last_error: string;
      worker_version: string;
      last_worker_heartbeat_at: string | null;
      updated_at: string;
    }>;
  };
}

const toComponent = (dto: ServiceComponentDto): ServiceComponent => ({
  id: dto.id,
  status: dto.status === "up" || dto.status === "down" ? dto.status : "unknown",
  detail: dto.detail,
  latencyMs: typeof dto.latency_ms === "number" ? dto.latency_ms : null,
});

export const getServiceStatus = async (): Promise<ServiceStatusReport> => {
  const dto = await requestJson<ServiceStatusReportDto>(
    httpClient.get("/api/v1/system/service-status"),
    "Failed to load service status",
  );
  return {
    generatedAt: dto.generated_at,
    components: dto.components.map(toComponent),
    integrity: {
      liveRunCount: dto.integrity.live_run_count,
      unhealthyRunCount: dto.integrity.unhealthy_run_count,
      staleHeartbeatCount: dto.integrity.stale_heartbeat_count,
      neverReportedCount: dto.integrity.never_reported_count,
      heartbeatStaleAfterSeconds: dto.integrity.heartbeat_stale_after_seconds,
      unhealthyRuns: dto.integrity.unhealthy_runs.map((run) => ({
        id: run.id,
        contestId: run.contest_id,
        sessionState: run.session_state,
        dataState: run.data_state,
        lastError: run.last_error,
        workerVersion: run.worker_version,
        lastWorkerHeartbeatAt: run.last_worker_heartbeat_at,
        updatedAt: run.updated_at,
      })),
    },
  };
};
