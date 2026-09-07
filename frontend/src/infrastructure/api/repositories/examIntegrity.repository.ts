import type {
  EvidenceCheckpointRequest,
  EvidenceCheckpointResponse,
  EvidenceManifestResponse,
  ExamIntegrityBatch,
  ExamIntegrityBatchAck,
  ExamIntegrityEvidenceDescriptor,
  ExamIntegrityRecord,
  EvidenceRetainCommand,
  ExamIntegrityRun,
  IntegrityUploadScope,
} from "@/core/entities/examIntegrity.entity";
import { httpClient, requestJson } from "@/infrastructure/api/http.client";

export interface ExamIntegrityRepository {
  listRuns(contestId: string): Promise<ExamIntegrityRun[]>;
  getRun(contestId: string, runId: string): Promise<ExamIntegrityRun>;
  createRun(contestId: string): Promise<ExamIntegrityRun>;
  startRun(contestId: string, runId: string): Promise<ExamIntegrityRun>;
  restartRun(contestId: string, runId: string): Promise<ExamIntegrityRun>;
  stopRun(contestId: string, runId: string): Promise<ExamIntegrityRun>;
  destroyRun(contestId: string, runId: string): Promise<ExamIntegrityRun>;
  purgeRun(contestId: string, runId: string): Promise<ExamIntegrityRun>;
  sendBatch(
    contestId: string,
    batch: ExamIntegrityBatch,
    signal?: AbortSignal,
    uploadScope?: IntegrityUploadScope,
  ): Promise<ExamIntegrityBatchAck>;
  pollUpload(contestId: string, scope: IntegrityUploadScope, finalSeq?: number, signal?: AbortSignal): Promise<ExamIntegrityBatchAck>;
  submitEvidenceCheckpoint(
    contestId: string,
    request: EvidenceCheckpointRequest,
  ): Promise<EvidenceCheckpointResponse>;
}

const mapDescriptor = (descriptor: ExamIntegrityEvidenceDescriptor) => ({
  source: descriptor.source,
  recording_session_id: descriptor.recordingSessionId,
  chunk_seq: descriptor.chunkSeq,
  is_init_chunk: descriptor.isInitChunk,
  start_at_ms: descriptor.startAtMs,
  end_at_ms: descriptor.endAtMs,
  byte_size: descriptor.byteSize,
  codec: descriptor.codec,
  content_type: descriptor.contentType,
  sha256: descriptor.sha256,
  previous_sha256: descriptor.previousSha256,
  local_descriptor_id: descriptor.localDescriptorId,
});

const mapRecord = (record: ExamIntegrityRecord) => ({
  event_id: record.eventId,
  seq: record.seq,
  kind: record.kind,
  event_type: record.eventType,
  event_schema_version: record.eventSchemaVersion,
  client_occurred_at_ms: record.clientOccurredAtMs,
  client_recorded_at_ms: record.clientRecordedAtMs,
  monotonic_ms: record.monotonicMs,
  payload: record.payload,
  evidence_descriptors: record.evidenceDescriptors.map(mapDescriptor),
});

const mapBatch = (batch: ExamIntegrityBatch) => ({
  schema_version: batch.schemaVersion,
  batch_id: batch.batchId,
  run_id: batch.runId,
  participant_id: batch.participantId,
  device_id: batch.deviceId,
  registry_version: batch.registryVersion,
  first_seq: batch.firstSeq,
  last_seq: batch.lastSeq,
  records: batch.records.map(mapRecord),
  client_build: batch.clientBuild,
});

const mapCommand = (command: {
  command_id: string;
  incident_id: string;
  event_id: string;
  sources: EvidenceRetainCommand["sources"];
  start_at_ms: number;
  end_at_ms: number;
}): EvidenceRetainCommand => ({
  commandId: command.command_id,
  incidentId: command.incident_id,
  eventId: command.event_id,
  sources: command.sources,
  startAtMs: command.start_at_ms,
  endAtMs: command.end_at_ms,
});

interface WireBatchAck {
  processed_through_seq?: number;
  upload_status?: "pending" | "complete" | "expired";
  acked_through_seq: number;
  pending_commands: Array<Parameters<typeof mapCommand>[0]>;
  release_evidence_before_ms: number;
}

const mapAck = (ack: WireBatchAck, batch?: ExamIntegrityBatch): ExamIntegrityBatchAck => {
  if (
    !Number.isSafeInteger(ack.acked_through_seq)
    || ack.acked_through_seq < 0
    || (batch && (ack.acked_through_seq < batch.firstSeq || ack.acked_through_seq > batch.lastSeq))
    || !Array.isArray(ack.pending_commands)
    || !Number.isSafeInteger(ack.release_evidence_before_ms)
    || ack.release_evidence_before_ms < 0
  ) {
    throw new Error("Invalid integrity batch acknowledgement");
  }
  return {
    ...(ack.upload_status ? { uploadStatus: ack.upload_status, processedThroughSeq: ack.processed_through_seq } : {}),
    ackedThroughSeq: ack.acked_through_seq,
    pendingCommands: ack.pending_commands.map(mapCommand),
    releaseEvidenceBeforeMs: ack.release_evidence_before_ms,
  };
};

const apiPath = (contestId: string, path: string): string =>
  `/api/v1/contests/${encodeURIComponent(contestId)}/exam/integrity/${path}/`;

const managerApiPath = (contestId: string, suffix = ""): string =>
  `/api/v1/contests/${encodeURIComponent(contestId)}/integrity-runs/${suffix}`;

type WireIntegrityRun = {
  id: string;
  compute_state: ExamIntegrityRun["computeState"];
  health: ExamIntegrityRun["health"];
  data_state: ExamIntegrityRun["dataState"];
  warnings?: unknown;
  metrics?: unknown;
  last_error?: unknown;
  last_correlation_id?: unknown;
  registry_version: unknown;
  worker_image?: unknown;
  worker_image_digest?: unknown;
  worker_version?: unknown;
  last_worker_heartbeat_at?: unknown;
  scheduled_start_at?: unknown;
  scheduled_end_at?: unknown;
  started_at?: unknown;
  stopped_at?: unknown;
  destroyed_at?: unknown;
  purged_at?: unknown;
  retention_until?: unknown;
  archive_generation?: unknown;
  received_counts?: unknown;
  processed_counts?: unknown;
  archived_counts?: unknown;
};

const stringOrEmpty = (value: unknown): string => typeof value === "string" ? value : "";
const nullableString = (value: unknown): string | null => typeof value === "string" ? value : null;
const numberOrZero = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;
const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const metricMap = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
};
const countMap = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, item]) =>
    typeof item === "number" && Number.isFinite(item),
  ));
};

const mapRun = (run: WireIntegrityRun): ExamIntegrityRun => {
  if (!run || typeof run.id !== "string") throw new Error("Invalid integrity run response");
  return {
    id: run.id,
    computeState: run.compute_state,
    health: run.health,
    dataState: run.data_state,
    warnings: stringList(run.warnings),
    metrics: metricMap(run.metrics),
    lastError: stringOrEmpty(run.last_error),
    lastCorrelationId: stringOrEmpty(run.last_correlation_id),
    registryVersion: stringOrEmpty(run.registry_version),
    workerImage: stringOrEmpty(run.worker_image),
    workerImageDigest: stringOrEmpty(run.worker_image_digest),
    workerVersion: stringOrEmpty(run.worker_version),
    lastWorkerHeartbeatAt: nullableString(run.last_worker_heartbeat_at),
    scheduledStartAt: nullableString(run.scheduled_start_at),
    scheduledEndAt: nullableString(run.scheduled_end_at),
    startedAt: nullableString(run.started_at),
    stoppedAt: nullableString(run.stopped_at),
    destroyedAt: nullableString(run.destroyed_at),
    purgedAt: nullableString(run.purged_at),
    retentionUntil: nullableString(run.retention_until),
    archiveGeneration: numberOrZero(run.archive_generation),
    receivedCounts: countMap(run.received_counts),
    processedCounts: countMap(run.processed_counts),
    archivedCounts: countMap(run.archived_counts),
  };
};

const mapManifestResponse = (response: {
  uploads: Array<{
    chunk_id: string;
    chunk_seq: number;
    source: "screen_share" | "webcam";
    object_key: string;
    status: string;
    put_url: string | null;
    required_headers: Record<string, string>;
  }>;
}): EvidenceManifestResponse => ({
  uploads: response.uploads.map((upload) => ({
    chunkId: upload.chunk_id,
    chunkSeq: upload.chunk_seq,
    source: upload.source,
    objectKey: upload.object_key,
    status: upload.status,
    putUrl: upload.put_url,
    requiredHeaders: upload.required_headers,
  })),
});

export const examIntegrityRepository: ExamIntegrityRepository = {
  async listRuns(contestId) {
    const response = await requestJson<WireIntegrityRun[]>(
      httpClient.get(managerApiPath(contestId)),
      "Failed to load integrity runs",
    );
    return response.map(mapRun);
  },

  async getRun(contestId, runId) {
    return mapRun(await requestJson<WireIntegrityRun>(
      httpClient.get(managerApiPath(contestId, `${encodeURIComponent(runId)}/`)),
      "Failed to load integrity run",
    ));
  },

  async createRun(contestId) {
    return mapRun(await requestJson<WireIntegrityRun>(
      httpClient.post(managerApiPath(contestId), {}),
      "Failed to create integrity run",
    ));
  },

  async startRun(contestId, runId) {
    return mapRun(await requestJson<WireIntegrityRun>(
      httpClient.post(managerApiPath(contestId, `${encodeURIComponent(runId)}/start/`), {}),
      "Failed to start integrity run",
    ));
  },

  async restartRun(contestId, runId) {
    return mapRun(await requestJson<WireIntegrityRun>(
      httpClient.post(managerApiPath(contestId, `${encodeURIComponent(runId)}/restart/`), {}),
      "Failed to restart integrity Worker",
    ));
  },

  async stopRun(contestId, runId) {
    return mapRun(await requestJson<WireIntegrityRun>(
      httpClient.post(managerApiPath(contestId, `${encodeURIComponent(runId)}/stop/`), {}),
      "Failed to stop integrity run",
    ));
  },

  async destroyRun(contestId, runId) {
    return mapRun(await requestJson<WireIntegrityRun>(
      httpClient.post(managerApiPath(contestId, `${encodeURIComponent(runId)}/destroy/`), {}),
      "Failed to destroy integrity run",
    ));
  },

  async purgeRun(contestId, runId) {
    return mapRun(await requestJson<WireIntegrityRun>(
      httpClient.post(managerApiPath(contestId, `${encodeURIComponent(runId)}/purge/`), {}),
      "Failed to purge integrity run data",
    ));
  },

  async sendBatch(contestId, batch, signal, uploadScope) {
    const response = await requestJson<{
      acked_through_seq: number;
      pending_commands: Array<Parameters<typeof mapCommand>[0]>;
      release_evidence_before_ms: number;
    }>(
      httpClient.requestOnce(apiPath(contestId, "checkpoints"), {
        method: "POST",
        body: JSON.stringify({
          ...(uploadScope ? { upload_scope: uploadScope } : {}),
          observations: mapBatch(batch),
          evidence: {
            manifests: [],
            completions: [],
            unavailable: [],
          },
        }),
        headers: { "Content-Type": "application/json" },
        signal,
      }),
      "Failed to send integrity batch",
    );
    return mapAck(response, uploadScope ? undefined : batch);
  },

  async pollUpload(contestId, scope, finalSeq, signal) {
    return mapAck(await requestJson<WireBatchAck>(httpClient.requestOnce(apiPath(contestId, "checkpoints"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({ upload_scope: scope, observations: null,
        ...(finalSeq !== undefined ? { final_seq: finalSeq } : {}),
        evidence: { manifests: [], completions: [], unavailable: [] } }),
    }), "Failed to poll integrity upload"));
  },

  async submitEvidenceCheckpoint(contestId, request) {
    const post = request.uploadScope
      ? (url: string, body: unknown) => httpClient.requestOnce(url, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        })
      : httpClient.post;
    const response = await requestJson<{
      uploads: Array<{
        chunk_id: string;
        chunk_seq: number;
        source: "screen_share" | "webcam";
        object_key: string;
        status: string;
        put_url: string | null;
        required_headers: Record<string, string>;
      }>;
      completions: Array<{
        chunk_id: string;
        status: string;
      }>;
    }>(
      post(apiPath(contestId, "checkpoints"), {
        ...(request.uploadScope ? { upload_scope: request.uploadScope } : {}),
        evidence: {
          manifests: request.manifests.map((manifest) => ({
            run_id: manifest.runId,
            incident_id: manifest.incidentId,
            chunks: manifest.chunks.map(mapDescriptor),
          })),
          completions: request.completions.map((chunkId) => ({
            chunk_id: chunkId,
          })),
          unavailable: request.unavailable.map((report) => (
            "chunkId" in report
              ? { chunk_id: report.chunkId, reason: report.reason }
              : {
                  run_id: report.runId,
                  incident_id: report.incidentId,
                  event_id: report.eventId,
                  source: report.source,
                  reason: report.reason,
                }
          )),
        },
      }),
      "Failed to submit evidence checkpoint",
    );
    return {
      ...mapManifestResponse(response),
      completions: response.completions.map((completion) => ({
        chunkId: completion.chunk_id,
        status: completion.status,
      })),
    };
  },
};
