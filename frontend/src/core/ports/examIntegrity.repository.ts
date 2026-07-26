import type {
  ClaimedIntegrityBatch,
  ExamIntegrityEvidenceDescriptor,
  ExamIntegrityRecord,
  IntegrityPayload,
} from "@/core/entities/examIntegrity.entity";

export interface AppendIntegritySignal {
  eventType: string;
  clientOccurredAtMs: number;
  payload: IntegrityPayload;
  /** Descriptor summaries only; media bytes remain in OPFS. */
  evidenceDescriptors?: ExamIntegrityEvidenceDescriptor[];
}

export interface BatchFailure {
  kind: "transient" | "permanent";
  status?: number;
  message?: string;
}

export interface ExamIntegrityOutbox {
  append(signal: AppendIntegritySignal): Promise<ExamIntegrityRecord>;
  claimBatch(limit: {
    maxRecords: number;
    maxBytes: number;
  }): Promise<ClaimedIntegrityBatch | null>;
  ackThrough(runId: string, deviceId: string, seq: number): Promise<void>;
  failBatch(batchId: string, failure: BatchFailure): Promise<void>;
  listPending(): Promise<ExamIntegrityRecord[]>;
  close(): Promise<void>;
}
