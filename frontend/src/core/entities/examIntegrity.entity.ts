/**
 * Serializable contracts shared by the exam integrity runtime and adapters.
 *
 * This module intentionally has no browser, React, storage, or HTTP imports.
 */

export type IntegrityEvidenceSource = "screen_share" | "webcam";
export type IntegrityCaptureState = "active" | "inactive" | "disabled" | "unavailable";
export type IntegrityHealthStatus =
  | "healthy"
  | "active"
  | "initializing"
  | "degraded"
  | "unavailable"
  | "disabled";
export type IntegrityRecordKind = "event" | "health_snapshot";
export type IntegrityJsonPrimitive = string | number | boolean | null;
export type IntegrityJsonValue =
  | IntegrityJsonPrimitive
  | IntegrityJsonValue[]
  | { [key: string]: IntegrityJsonValue };

export interface ExamIntegrityEvidenceDescriptor {
  source: IntegrityEvidenceSource;
  recordingSessionId: string;
  chunkSeq: number;
  isInitChunk: boolean;
  startAtMs: number;
  endAtMs: number;
  byteSize: number;
  codec: string;
  contentType: "video/webm";
  sha256: string;
  previousSha256: string;
  localDescriptorId: string;
}

export interface IntegrityHealthComponent {
  status: IntegrityHealthStatus;
  reason?: string;
}

export interface ExamIntegrityHealthSnapshot {
  displayApi: IntegrityHealthComponent;
  evidenceSources: Record<IntegrityEvidenceSource, IntegrityHealthComponent>;
  evidenceBuffer: Record<IntegrityEvidenceSource, IntegrityHealthComponent>;
}

export type IntegrityHealthUpdate =
  | ({ component: "display_api" } & IntegrityHealthComponent)
  | ({
      component: "evidence_source" | "evidence_buffer";
      source: IntegrityEvidenceSource;
    } & IntegrityHealthComponent);

export interface ExamIntegrityStateSnapshot {
  pageVisible: boolean;
  online: boolean;
  fullscreen: boolean;
  screenCapture: IntegrityCaptureState;
  webcamCapture: IntegrityCaptureState;
  health: ExamIntegrityHealthSnapshot;
  activeSourceDescriptors: ExamIntegrityEvidenceDescriptor[];
}

export type IntegrityPayload =
  | Record<string, IntegrityJsonValue>
  | ExamIntegrityStateSnapshot;

export interface ExamIntegrityRecord {
  eventId: string;
  seq: number;
  kind: IntegrityRecordKind;
  eventType: string;
  eventSchemaVersion: number;
  clientOccurredAtMs: number;
  clientRecordedAtMs: number;
  monotonicMs: number;
  payload: IntegrityPayload;
  evidenceDescriptors: ExamIntegrityEvidenceDescriptor[];
}

export interface ExamIntegrityBatch {
  schemaVersion: 1;
  batchId: string;
  runId: string;
  participantId: number;
  deviceId: string;
  registryVersion: string;
  firstSeq: number;
  lastSeq: number;
  records: ExamIntegrityRecord[];
  clientBuild: string;
}

export interface ClaimedIntegrityBatch extends ExamIntegrityBatch {}

export interface EvidenceRetainCommand {
  commandId: string;
  incidentId: string;
  eventId: string;
  sources: IntegrityEvidenceSource[];
  startAtMs: number;
  endAtMs: number;
}

export interface ExamIntegrityBatchAck {
  ackedThroughSeq: number;
  pendingCommands: EvidenceRetainCommand[];
  releaseEvidenceBeforeMs: number;
}

export interface EvidenceManifestRequest {
  runId: string;
  incidentId: string;
  chunks: ExamIntegrityEvidenceDescriptor[];
}

export interface EvidenceManifestUpload {
  chunkId: string;
  chunkSeq: number;
  source: IntegrityEvidenceSource;
  objectKey: string;
  status: string;
  putUrl: string | null;
  requiredHeaders: Record<string, string>;
}

export interface EvidenceManifestResponse {
  uploads: EvidenceManifestUpload[];
}

export type EvidenceUnavailableReport =
  | {
      chunkId: string;
      reason: string;
    }
  | {
      runId: string;
      incidentId: string;
      eventId: number;
      source: IntegrityEvidenceSource;
      reason: string;
    };

export interface EvidenceCheckpointRequest {
  manifests: EvidenceManifestRequest[];
  completions: string[];
  unavailable: EvidenceUnavailableReport[];
}

export interface EvidenceCheckpointResponse {
  uploads: EvidenceManifestUpload[];
  completions: Array<{ chunkId: string; status: string }>;
}

/** Manager-facing projection of one system-managed Integrity Worker run. */
export interface ExamIntegrityRun {
  id: string;
  computeState: "stopped" | "starting" | "running" | "stopping" | "destroyed";
  health: "healthy" | "unhealthy";
  dataState: "open" | "archived" | "purged";
  warnings: string[];
  metrics: Record<string, unknown>;
  lastError: string;
  lastCorrelationId: string;
  registryVersion: string;
  workerImage: string;
  workerImageDigest: string;
  workerVersion: string;
  lastWorkerHeartbeatAt: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  destroyedAt: string | null;
  purgedAt: string | null;
  retentionUntil: string | null;
  archiveGeneration: number;
  receivedCounts: Record<string, number>;
  processedCounts: Record<string, number>;
  archivedCounts: Record<string, number>;
}
