/**
 * Serializable contracts shared by the exam integrity runtime and adapters.
 *
 * This module intentionally has no browser, React, storage, or HTTP imports.
 */

export type IntegrityEvidenceSource = "screen_share" | "webcam";
export type IntegrityCaptureState = "active" | "inactive" | "disabled" | "unavailable";
export type IntegrityRecordKind = "event" | "state_snapshot";
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

export interface ExamIntegrityStateSnapshot {
  pageVisible: boolean;
  online: boolean;
  fullscreen: boolean;
  screenCapture: IntegrityCaptureState;
  webcamCapture: IntegrityCaptureState;
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
