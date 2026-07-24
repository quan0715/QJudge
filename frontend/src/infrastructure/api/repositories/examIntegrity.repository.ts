import type {
  EvidenceManifestRequest,
  EvidenceManifestResponse,
  EvidenceUnavailableReport,
  ExamIntegrityBatch,
  ExamIntegrityBatchAck,
  ExamIntegrityEvidenceDescriptor,
  ExamIntegrityRecord,
  EvidenceRetainCommand,
} from "@/core/entities/examIntegrity.entity";
import { ensureOk, httpClient, requestJson } from "@/infrastructure/api/http.client";

export interface ExamIntegrityRepository {
  sendBatch(
    contestId: string,
    batch: ExamIntegrityBatch,
    signal?: AbortSignal,
  ): Promise<ExamIntegrityBatchAck>;
  requestEvidenceUploads(
    contestId: string,
    request: EvidenceManifestRequest,
  ): Promise<EvidenceManifestResponse>;
  completeEvidenceUpload(contestId: string, chunkId: string): Promise<void>;
  reportEvidenceUnavailable(contestId: string, report: EvidenceUnavailableReport): Promise<void>;
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
  acked_through_seq: number;
  pending_commands: Array<Parameters<typeof mapCommand>[0]>;
  release_evidence_before_ms: number;
}

const mapAck = (ack: WireBatchAck, batch: ExamIntegrityBatch): ExamIntegrityBatchAck => {
  if (
    !Number.isSafeInteger(ack.acked_through_seq)
    || ack.acked_through_seq < batch.firstSeq
    || ack.acked_through_seq > batch.lastSeq
    || !Array.isArray(ack.pending_commands)
    || !Number.isSafeInteger(ack.release_evidence_before_ms)
    || ack.release_evidence_before_ms < 0
  ) {
    throw new Error("Invalid integrity batch acknowledgement");
  }
  return {
    ackedThroughSeq: ack.acked_through_seq,
    pendingCommands: ack.pending_commands.map(mapCommand),
    releaseEvidenceBeforeMs: ack.release_evidence_before_ms,
  };
};

const apiPath = (contestId: string, path: string): string =>
  `/api/v1/contests/${encodeURIComponent(contestId)}/exam/integrity/${path}/`;

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
  async sendBatch(contestId, batch, signal) {
    const response = await requestJson<{
      acked_through_seq: number;
      pending_commands: Array<Parameters<typeof mapCommand>[0]>;
      release_evidence_before_ms: number;
    }>(
      httpClient.requestOnce(apiPath(contestId, "batches"), {
        method: "POST",
        body: JSON.stringify(mapBatch(batch)),
        headers: { "Content-Type": "application/json" },
        signal,
      }),
      "Failed to send integrity batch",
    );
    return mapAck(response, batch);
  },

  async requestEvidenceUploads(contestId, request) {
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
    }>(
      httpClient.post(apiPath(contestId, "evidence/manifest"), {
        run_id: request.runId,
        incident_id: request.incidentId,
        chunks: request.chunks.map(mapDescriptor),
      }),
      "Failed to request evidence uploads",
    );
    return mapManifestResponse(response);
  },

  async completeEvidenceUpload(contestId, chunkId) {
    await ensureOk(
      httpClient.post(apiPath(contestId, "evidence/complete"), { chunk_id: chunkId }),
      "Failed to complete evidence upload",
    );
  },

  async reportEvidenceUnavailable(contestId, report) {
    const payload = "chunkId" in report
      ? { chunk_id: report.chunkId, reason: report.reason }
      : {
          run_id: report.runId,
          incident_id: report.incidentId,
          event_id: report.eventId,
          source: report.source,
          reason: report.reason,
        };
    await ensureOk(
      httpClient.post(apiPath(contestId, "evidence/unavailable"), payload),
      "Failed to report unavailable evidence",
    );
  },
};

export default examIntegrityRepository;
