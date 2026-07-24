import type {
  ClaimedIntegrityBatch,
  ExamIntegrityRecord,
} from "@/core/entities/examIntegrity.entity";
import type {
  AppendIntegritySignal,
  BatchFailure,
  ExamIntegrityOutbox,
} from "@/core/ports/examIntegrity.port";

const DATABASE_NAME = "qjudge-exam-integrity-v1";
const DATABASE_VERSION = 1;
const RECORDS_STORE = "records";
const META_STORE = "meta";
const EVIDENCE_DESCRIPTORS_STORE = "evidenceDescriptors";

interface StoredRecord extends ExamIntegrityRecord {
  runId: string;
  deviceId: string;
  batchId?: string;
  acked: boolean;
  blocked?: {
    status?: number;
    message?: string;
  };
}

interface StoredMeta {
  runId: string;
  deviceId: string;
  nextSeq: number;
  ackedThroughSeq: number;
  inflightBatchId?: string;
}

export interface IndexedDbIntegrityOutboxOptions {
  runId: string;
  participantId: number;
  deviceId: string;
  registryVersion: string;
  clientBuild: string;
  databaseName?: string;
  now?: () => number;
  monotonicNow?: () => number;
  createId?: () => string;
}

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });

const createUuid = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  throw new Error("Web Crypto randomUUID is required for integrity records");
};

const defaultMonotonicNow = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

const ensureIntegrityStores = (database: IDBDatabase): void => {
  if (!database.objectStoreNames.contains(RECORDS_STORE)) {
    const records = database.createObjectStore(RECORDS_STORE, {
      keyPath: ["runId", "deviceId", "seq"],
    });
    records.createIndex("batchId", "batchId", { unique: false });
    records.createIndex("acked", "acked", { unique: false });
  }
  if (!database.objectStoreNames.contains(META_STORE)) {
    database.createObjectStore(META_STORE, {
      keyPath: ["runId", "deviceId"],
    });
  }
  if (!database.objectStoreNames.contains(EVIDENCE_DESCRIPTORS_STORE)) {
    database.createObjectStore(EVIDENCE_DESCRIPTORS_STORE, {
      keyPath: ["runId", "deviceId", "localDescriptorId"],
    });
  }
};

const openDatabase = (name: string): Promise<IDBDatabase> =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is required for the integrity outbox"));
      return;
    }
    const request = indexedDB.open(name, DATABASE_VERSION);
    request.onupgradeneeded = () => ensureIntegrityStores(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open integrity outbox"));
  });

const recordRange = (runId: string, deviceId: string): IDBKeyRange =>
  IDBKeyRange.bound(
    [runId, deviceId, Number.MIN_SAFE_INTEGER],
    [runId, deviceId, Number.MAX_SAFE_INTEGER],
  );

const toRecord = (stored: StoredRecord): ExamIntegrityRecord => ({
  eventId: stored.eventId,
  seq: stored.seq,
  kind: stored.kind,
  eventType: stored.eventType,
  eventSchemaVersion: stored.eventSchemaVersion,
  clientOccurredAtMs: stored.clientOccurredAtMs,
  clientRecordedAtMs: stored.clientRecordedAtMs,
  monotonicMs: stored.monotonicMs,
  payload: stored.payload,
  evidenceDescriptors: stored.evidenceDescriptors,
});

const utf8ByteLength = (value: string): number => new TextEncoder().encode(value).byteLength;

const toWireDescriptor = (descriptor: ExamIntegrityRecord["evidenceDescriptors"][number]) => ({
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

const toWireRecord = (record: StoredRecord) => ({
  event_id: record.eventId,
  seq: record.seq,
  kind: record.kind,
  event_type: record.eventType,
  event_schema_version: record.eventSchemaVersion,
  client_occurred_at_ms: record.clientOccurredAtMs,
  client_recorded_at_ms: record.clientRecordedAtMs,
  monotonic_ms: record.monotonicMs,
  payload: record.payload,
  evidence_descriptors: record.evidenceDescriptors.map(toWireDescriptor),
});

const sortBySeq = (records: StoredRecord[]): StoredRecord[] =>
  records.sort((left, right) => left.seq - right.seq);

const validLimit = (limit: { maxRecords: number; maxBytes: number }): void => {
  if (!Number.isInteger(limit.maxRecords) || limit.maxRecords < 1) {
    throw new Error("maxRecords must be a positive integer");
  }
  if (!Number.isInteger(limit.maxBytes) || limit.maxBytes < 1) {
    throw new Error("maxBytes must be a positive integer");
  }
};

/**
 * Browser persistence adapter for the write-before-send integrity protocol.
 * Every sequence allocation and record insert completes in one IndexedDB
 * read-write transaction before append resolves.
 */
export class IndexedDbIntegrityOutbox implements ExamIntegrityOutbox {
  private readonly database: IDBDatabase;
  private readonly options: Required<
      Pick<IndexedDbIntegrityOutboxOptions, "runId" | "participantId" | "deviceId" | "registryVersion" | "clientBuild">
    > &
      Pick<IndexedDbIntegrityOutboxOptions, "now" | "monotonicNow" | "createId">;

  private constructor(
    database: IDBDatabase,
    options: Required<
      Pick<IndexedDbIntegrityOutboxOptions, "runId" | "participantId" | "deviceId" | "registryVersion" | "clientBuild">
    > &
      Pick<IndexedDbIntegrityOutboxOptions, "now" | "monotonicNow" | "createId">,
  ) {
    this.database = database;
    this.options = options;
  }

  static async open(options: IndexedDbIntegrityOutboxOptions): Promise<IndexedDbIntegrityOutbox> {
    const database = await openDatabase(options.databaseName ?? DATABASE_NAME);
    return new IndexedDbIntegrityOutbox(database, {
      runId: options.runId,
      participantId: options.participantId,
      deviceId: options.deviceId,
      registryVersion: options.registryVersion,
      clientBuild: options.clientBuild,
      now: options.now ?? Date.now,
      monotonicNow: options.monotonicNow ?? defaultMonotonicNow,
      createId: options.createId ?? createUuid,
    });
  }

  async append(signal: AppendIntegritySignal): Promise<ExamIntegrityRecord> {
    const transaction = this.database.transaction([RECORDS_STORE, META_STORE], "readwrite");
    const done = transactionDone(transaction);
    const records = transaction.objectStore(RECORDS_STORE);
    const metaStore = transaction.objectStore(META_STORE);
    try {
      const existingMeta = await requestResult(
        metaStore.get([this.options.runId, this.options.deviceId]),
      ) as StoredMeta | undefined;
      const meta: StoredMeta = existingMeta ?? {
        runId: this.options.runId,
        deviceId: this.options.deviceId,
        nextSeq: 1,
        ackedThroughSeq: 0,
      };
      const now = this.options.now!();
      const stored: StoredRecord = {
        runId: this.options.runId,
        deviceId: this.options.deviceId,
        eventId: this.options.createId!(),
        seq: meta.nextSeq,
        kind: signal.eventType === "state_snapshot" ? "state_snapshot" : "event",
        eventType: signal.eventType,
        eventSchemaVersion: 1,
        clientOccurredAtMs: signal.clientOccurredAtMs,
        clientRecordedAtMs: now,
        monotonicMs: this.options.monotonicNow!(),
        payload: signal.payload,
        evidenceDescriptors: [],
        acked: false,
      };
      meta.nextSeq += 1;
      records.add(stored);
      metaStore.put(meta);
      await done;
      return toRecord(stored);
    } catch (error) {
      transaction.abort();
      throw error;
    }
  }

  async claimBatch(limit: { maxRecords: number; maxBytes: number }): Promise<ClaimedIntegrityBatch | null> {
    validLimit(limit);
    const transaction = this.database.transaction([RECORDS_STORE, META_STORE], "readwrite");
    const done = transactionDone(transaction);
    const recordsStore = transaction.objectStore(RECORDS_STORE);
    const metaStore = transaction.objectStore(META_STORE);
    try {
      const meta = await requestResult(
        metaStore.get([this.options.runId, this.options.deviceId]),
      ) as StoredMeta | undefined;
      if (!meta) {
        await done;
        return null;
      }
      const allRecords = sortBySeq(
        (await requestResult(recordsStore.getAll(recordRange(this.options.runId, this.options.deviceId)))) as StoredRecord[],
      );
      let selected: StoredRecord[];
      if (meta.inflightBatchId) {
        selected = allRecords.filter(
          (record) => record.batchId === meta.inflightBatchId && !record.acked && !record.blocked,
        );
        if (selected.length === 0) {
          delete meta.inflightBatchId;
          metaStore.put(meta);
          await done;
          return null;
        }
      } else {
        selected = [];
        let expectedSeq = meta.ackedThroughSeq + 1;
        const candidateBatchId = this.options.createId!();
        for (const record of allRecords) {
          if (record.acked || record.blocked || record.seq !== expectedSeq) break;
          if (selected.length >= limit.maxRecords) break;
          const candidateRecords = [...selected, record];
          const nextSize = utf8ByteLength(JSON.stringify({
            schema_version: 1,
            batch_id: candidateBatchId,
            run_id: this.options.runId,
            participant_id: this.options.participantId,
            device_id: this.options.deviceId,
            registry_version: this.options.registryVersion,
            first_seq: candidateRecords[0].seq,
            last_seq: candidateRecords[candidateRecords.length - 1].seq,
            records: candidateRecords.map(toWireRecord),
            client_build: this.options.clientBuild,
          }));
          if (nextSize > limit.maxBytes) break;
          selected = candidateRecords;
          expectedSeq += 1;
        }
        if (selected.length === 0) {
          await done;
          return null;
        }
        meta.inflightBatchId = candidateBatchId;
        for (const record of selected) {
          record.batchId = meta.inflightBatchId;
          recordsStore.put(record);
        }
        metaStore.put(meta);
      }
      await done;
      const records = selected.map(toRecord);
      return {
        schemaVersion: 1,
        batchId: meta.inflightBatchId!,
        runId: this.options.runId,
        participantId: this.options.participantId,
        deviceId: this.options.deviceId,
        registryVersion: this.options.registryVersion,
        firstSeq: records[0].seq,
        lastSeq: records[records.length - 1].seq,
        records,
        clientBuild: this.options.clientBuild,
      };
    } catch (error) {
      transaction.abort();
      throw error;
    }
  }

  async ackThrough(runId: string, deviceId: string, seq: number): Promise<void> {
    if (runId !== this.options.runId || deviceId !== this.options.deviceId) {
      throw new Error("ACK identity does not match this integrity outbox");
    }
    const transaction = this.database.transaction([RECORDS_STORE, META_STORE], "readwrite");
    const done = transactionDone(transaction);
    const recordsStore = transaction.objectStore(RECORDS_STORE);
    const metaStore = transaction.objectStore(META_STORE);
    try {
      const meta = await requestResult(
        metaStore.get([this.options.runId, this.options.deviceId]),
      ) as StoredMeta | undefined;
      if (!meta?.inflightBatchId) {
        throw new Error("ACK received without a claimed integrity batch");
      }
      const allRecords = sortBySeq(
        (await requestResult(recordsStore.getAll(recordRange(runId, deviceId))) as StoredRecord[]),
      );
      const claimed = allRecords.filter(
        (record) => record.batchId === meta.inflightBatchId && !record.acked && !record.blocked,
      );
      const lastClaimedSeq = claimed[claimed.length - 1]?.seq;
      if (lastClaimedSeq === undefined || seq > lastClaimedSeq) {
        throw new Error("ACK cursor exceeds the claimed integrity batch");
      }
      for (const record of allRecords) {
        if (record.seq <= seq) {
          recordsStore.delete([runId, deviceId, record.seq]);
        }
      }
      meta.ackedThroughSeq = Math.max(meta.ackedThroughSeq, seq);
      if (seq >= lastClaimedSeq) delete meta.inflightBatchId;
      metaStore.put(meta);
      await done;
    } catch (error) {
      transaction.abort();
      throw error;
    }
  }

  async failBatch(batchId: string, failure: BatchFailure): Promise<void> {
    const transaction = this.database.transaction([RECORDS_STORE, META_STORE], "readwrite");
    const done = transactionDone(transaction);
    const recordsStore = transaction.objectStore(RECORDS_STORE);
    const metaStore = transaction.objectStore(META_STORE);
    try {
      const meta = await requestResult(
        metaStore.get([this.options.runId, this.options.deviceId]),
      ) as StoredMeta | undefined;
      if (!meta || meta.inflightBatchId !== batchId || failure.kind === "transient") {
        await done;
        return;
      }
      const allRecords = await requestResult(
        recordsStore.getAll(recordRange(this.options.runId, this.options.deviceId)),
      ) as StoredRecord[];
      for (const record of allRecords) {
        if (record.batchId === batchId && !record.acked) {
          record.blocked = { status: failure.status, message: failure.message };
          recordsStore.put(record);
        }
      }
      delete meta.inflightBatchId;
      metaStore.put(meta);
      await done;
    } catch (error) {
      transaction.abort();
      throw error;
    }
  }

  async listPending(): Promise<ExamIntegrityRecord[]> {
    const transaction = this.database.transaction(RECORDS_STORE, "readonly");
    const done = transactionDone(transaction);
    const records = sortBySeq(
      (await requestResult(
        transaction.objectStore(RECORDS_STORE).getAll(recordRange(this.options.runId, this.options.deviceId)),
      )) as StoredRecord[],
    )
      .filter((record) => !record.acked)
      .map(toRecord);
    await done;
    return records;
  }

  async close(): Promise<void> {
    this.database.close();
  }
}
