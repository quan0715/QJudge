/** Operator-facing view of the platform's own services. */

export type ServiceComponentStatus = "up" | "down" | "unknown";

export interface ServiceComponent {
  id: string;
  status: ServiceComponentStatus;
  detail: string;
  latencyMs: number | null;
}

export interface UnhealthyIntegrityRun {
  id: string;
  contestId: string;
  sessionState: string;
  dataState: string;
  lastError: string;
  workerVersion: string;
  lastWorkerHeartbeatAt: string | null;
  updatedAt: string;
}

export interface IntegrityRunSummary {
  liveRunCount: number;
  unhealthyRunCount: number;
  staleHeartbeatCount: number;
  neverReportedCount: number;
  heartbeatStaleAfterSeconds: number;
  unhealthyRuns: UnhealthyIntegrityRun[];
}

export interface ServiceStatusReport {
  generatedAt: string;
  components: ServiceComponent[];
  integrity: IntegrityRunSummary;
}
