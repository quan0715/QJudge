/** Operator-facing view of the platform's own services. */

import type { AgentState } from "./systemVersion.entity";

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

/** One compose container as the host deploy agent sees it. */
export interface ContainerStatus {
  project: string;
  service: string;
  state: string;
  /** Docker health check result; empty when the image defines none. */
  health: string;
}

export interface ContainerReport {
  agent: AgentState;
  /** Empty unless the agent answered. */
  items: ContainerStatus[];
}

/** A container is fine when it runs and its health check, if any, passes. */
export const isContainerHealthy = (container: ContainerStatus): boolean =>
  container.state === "running" && (container.health === "" || container.health === "healthy");

export interface ServiceStatusReport {
  generatedAt: string;
  components: ServiceComponent[];
  integrity: IntegrityRunSummary;
  containers: ContainerReport;
}

/** Probes and containers count as services alike, so every page agrees on the totals. */
export const summarizeServices = (
  report: ServiceStatusReport,
): { total: number; failed: number } => {
  const { components, containers } = report;
  return {
    total: components.length + containers.items.length,
    failed:
      components.filter((component) => component.status !== "up").length +
      containers.items.filter((container) => !isContainerHealthy(container)).length,
  };
};
