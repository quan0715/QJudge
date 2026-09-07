import type {
  ClaimedIntegrityBatch,
  ExamIntegrityRecord,
} from "@/core/entities/examIntegrity.entity";
import type {
  AppendIntegritySignal,
  BatchFailure,
  ExamIntegrityOutbox,
} from "@/core/ports/examIntegrity.repository";

const DATABASE_NAME = "qjudge-exam-integrity-v1";
const DATABASE_VERSION = 3;
const RECORDS_STORE = "records";
const META_STORE = "meta";
const EVIDENCE_DESCRIPTORS_STORE = "evidenceDescriptors";
const EVIDENCE_BLOBS_STORE = "evidenceBlobs";
const MAX_BATCH_RECORDS = 200;
const MAX_BATCH_BYTES = 1_048_576;
const MAX_PAYLOAD_BYTES = 32 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BATCH_ID_SIZE_PROBE = "00000000-0000-4000-8000-000000000000";

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
  attemptId?: string;
  runId: string;
  deviceId: string;
  nextSeq: number;
  ackedThroughSeq: number;
  /**
   * Immutable canonical headers for a leased batch. These must survive a
   * reload because changing a build or registry version under the same batch
   * ID would be rejected by the Worker as an identity conflict.
   */
  inflightBatch?: StoredBatchHeaders;
}

interface StoredBatchHeaders {
  batchId: string;
  participantId: number;
  registryVersion: string;
  clientBuild: string;
}

export interface IndexedDbIntegrityOutboxOptions {
  attemptId?: string;
  nextSequence?: number;
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
  if (!database.objectStoreNames.contains(EVIDENCE_BLOBS_STORE)) {
    database.createObjectStore(EVIDENCE_BLOBS_STORE, {
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
    request.onupgradeneeded = (event) => {
      ensureIntegrityStores(request.result);
      if (event.oldVersion > 0 && event.oldVersion < DATABASE_VERSION) {
        for (const storeName of request.result.objectStoreNames) {
          request.transaction?.objectStore(storeName).clear();
        }
      }
    };
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

const boundedLimit = (limit: { maxRecords: number; maxBytes: number }): {
  maxRecords: number;
  maxBytes: number;
} => {
  if (!Number.isSafeInteger(limit.maxRecords) || limit.maxRecords < 1) {
    throw new Error("maxRecords must be a positive integer");
  }
  if (!Number.isSafeInteger(limit.maxBytes) || limit.maxBytes < 1) {
    throw new Error("maxBytes must be a positive integer");
  }
  return {
    maxRecords: Math.min(limit.maxRecords, MAX_BATCH_RECORDS),
    maxBytes: Math.min(limit.maxBytes, MAX_BATCH_BYTES),
  };
};

function assertSafeInteger(value: unknown, field: string): asserts value is number {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${field} must be a safe integer`);
  }
}

function assertFiniteNonNegative(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite non-negative number`);
  }
}

const assertJsonValue = (value: unknown, seen = new WeakSet<object>()): void => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Integrity payload must contain finite JSON numbers");
    return;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error("Integrity payload must not contain cycles");
    seen.add(value);
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) throw new Error("Integrity payload must not contain sparse arrays");
      assertJsonValue(value[index], seen);
    }
    seen.delete(value);
    return;
  }
  if (typeof value === "object" && value !== null) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Integrity payload must contain plain JSON objects");
    }
    if (seen.has(value)) throw new Error("Integrity payload must not contain cycles");
    seen.add(value);
    for (const [key, item] of Object.entries(value)) {
      if (typeof key !== "string") throw new Error("Integrity payload keys must be strings");
      assertJsonValue(item, seen);
    }
    seen.delete(value);
    return;
  }
  throw new Error("Integrity payload must contain JSON-compatible values");
};

const assertUuid = (value: string, field: string): void => {
  if (!UUID_PATTERN.test(value)) throw new Error(`${field} must be a UUID`);
};

const batchWirePayload = (
  headers: StoredBatchHeaders,
  runId: string,
  deviceId: string,
  records: StoredRecord[],
) => ({
  schema_version: 1,
  batch_id: headers.batchId,
  run_id: runId,
  participant_id: headers.participantId,
  device_id: deviceId,
  registry_version: headers.registryVersion,
  first_seq: records[0].seq,
  last_seq: records[records.length - 1].seq,
  records: records.map(toWireRecord),
  client_build: headers.clientBuild,
});

const toClaimedBatch = (
  headers: StoredBatchHeaders,
  runId: string,
  deviceId: string,
  records: StoredRecord[],
): ClaimedIntegrityBatch => ({
  schemaVersion: 1,
  batchId: headers.batchId,
  runId,
  participantId: headers.participantId,
  deviceId,
  registryVersion: headers.registryVersion,
  firstSeq: records[0].seq,
  lastSeq: records[records.length - 1].seq,
  records: records.map(toRecord),
  clientBuild: headers.clientBuild,
});

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
      Pick<IndexedDbIntegrityOutboxOptions, "now" | "monotonicNow" | "createId" | "attemptId" | "nextSequence">;

  private constructor(
    database: IDBDatabase,
    options: Required<
      Pick<IndexedDbIntegrityOutboxOptions, "runId" | "participantId" | "deviceId" | "registryVersion" | "clientBuild">
    > &
      Pick<IndexedDbIntegrityOutboxOptions, "now" | "monotonicNow" | "createId" | "attemptId" | "nextSequence">,
  ) {
    this.database = database;
    this.options = options;
  }

  static async open(options: IndexedDbIntegrityOutboxOptions): Promise<IndexedDbIntegrityOutbox> {
    if (options.attemptId && (!Number.isSafeInteger(options.nextSequence) || options.nextSequence! < 1)) {
      throw new Error("Resident outbox requires an authoritative next sequence");
    }
    const database = await openDatabase(options.databaseName ?? DATABASE_NAME);
    if (options.attemptId) {
      const transaction = database.transaction([META_STORE, RECORDS_STORE], "readwrite");
      const done = transactionDone(transaction);
      const store = transaction.objectStore(META_STORE);
      const key = [options.runId, options.deviceId];
      const meta = await requestResult(store.get(key)) as StoredMeta | undefined;
      const count = await requestResult(transaction.objectStore(RECORDS_STORE).count(recordRange(options.runId, options.deviceId)));
      if (meta && meta.attemptId !== options.attemptId && count > 0) {
        await done;
        database.close();
        throw new Error("Unresolved records belong to a previous integrity attempt; local data preserved");
      }
      const nextSeq = Math.max(meta?.nextSeq ?? 1, options.nextSequence!);
      store.put(meta?.attemptId === options.attemptId && count > 0 ? meta : {
        runId: options.runId, deviceId: options.deviceId, attemptId: options.attemptId,
        nextSeq, ackedThroughSeq: nextSeq - 1,
      });
      await done;
    }
    return new IndexedDbIntegrityOutbox(database, {
      attemptId: options.attemptId,
      nextSequence: options.nextSequence,
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
      this.assertAttempt(meta);
      const now = this.options.now!();
      assertSafeInteger(signal.clientOccurredAtMs, "clientOccurredAtMs");
      if (signal.clientOccurredAtMs < 0) {
        throw new Error("clientOccurredAtMs must be non-negative");
      }
      if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(signal.eventType)) {
        throw new Error("eventType must be a 1–64 character identifier");
      }
      assertSafeInteger(now, "clientRecordedAtMs");
      if (now < 0) throw new Error("clientRecordedAtMs must be non-negative");
      const monotonicMs = this.options.monotonicNow!();
      assertFiniteNonNegative(monotonicMs, "monotonicMs");
      assertJsonValue(signal.payload);
      const eventId = this.options.createId!();
      assertUuid(eventId, "eventId");
      const stored: StoredRecord = {
        runId: this.options.runId,
        deviceId: this.options.deviceId,
        eventId,
        seq: meta.nextSeq,
        kind: signal.eventType === "health_snapshot" ? "health_snapshot" : "event",
        eventType: signal.eventType,
        eventSchemaVersion: 1,
        clientOccurredAtMs: signal.clientOccurredAtMs,
        clientRecordedAtMs: now,
        monotonicMs,
        payload: signal.payload,
        evidenceDescriptors: signal.evidenceDescriptors ?? [],
        acked: false,
      };
      const payloadBytes = utf8ByteLength(JSON.stringify(stored.payload));
      if (payloadBytes > MAX_PAYLOAD_BYTES) {
        throw new Error("Integrity payload exceeds the 32 KiB protocol limit");
      }
      const probeHeaders: StoredBatchHeaders = {
        batchId: BATCH_ID_SIZE_PROBE,
        participantId: this.options.participantId,
        registryVersion: this.options.registryVersion,
        clientBuild: this.options.clientBuild,
      };
      if (utf8ByteLength(JSON.stringify(batchWirePayload(
        probeHeaders,
        this.options.runId,
        this.options.deviceId,
        [stored],
      ))) > MAX_BATCH_BYTES) {
        throw new Error("Integrity record exceeds the 1 MiB batch protocol limit");
      }
      meta.nextSeq += 1;
      records.add(stored);
      metaStore.put(meta);
      await done;
      return toRecord(stored);
    } catch (error) {
      try { transaction.abort(); } catch { /* transaction already completed */ }
      await done.catch(() => undefined);
      throw error;
    }
  }

  async claimBatch(limit: { maxRecords: number; maxBytes: number }): Promise<ClaimedIntegrityBatch | null> {
    const bounded = boundedLimit(limit);
    const transaction = this.database.transaction(
      [RECORDS_STORE, META_STORE, EVIDENCE_DESCRIPTORS_STORE],
      "readwrite",
    );
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
      this.assertAttempt(meta);
      const allRecords = sortBySeq(
        (await requestResult(recordsStore.getAll(recordRange(this.options.runId, this.options.deviceId)))) as StoredRecord[],
      );
      let selected: StoredRecord[];
      let headers: StoredBatchHeaders | undefined = meta.inflightBatch;
      if (headers) {
        const inflightHeaders = headers;
        selected = allRecords.filter(
          (record) => record.batchId === inflightHeaders.batchId && !record.acked && !record.blocked,
        );
        if (selected.length === 0) {
          delete meta.inflightBatch;
          metaStore.put(meta);
          await done;
          return null;
        }
      } else {
        selected = [];
        let expectedSeq = this.options.attemptId ? allRecords[0]?.seq : meta.ackedThroughSeq + 1;
        const candidateBatchId = this.options.createId!();
        assertUuid(candidateBatchId, "batchId");
        headers = {
          batchId: candidateBatchId,
          participantId: this.options.participantId,
          registryVersion: this.options.registryVersion,
          clientBuild: this.options.clientBuild,
        };
        for (const record of allRecords) {
          if (record.acked || record.blocked || record.seq !== expectedSeq) break;
          if (selected.length >= bounded.maxRecords) break;
          const candidateRecords = [...selected, record];
          const nextSize = utf8ByteLength(JSON.stringify(batchWirePayload(
            headers,
            this.options.runId,
            this.options.deviceId,
            candidateRecords,
          )));
          if (nextSize > bounded.maxBytes) break;
          selected = candidateRecords;
          expectedSeq += 1;
        }
        if (selected.length === 0) {
          await done;
          return null;
        }
        meta.inflightBatch = headers;
        for (const record of selected) {
          record.batchId = headers.batchId;
          recordsStore.put(record);
        }
        metaStore.put(meta);
      }
      await done;
      return toClaimedBatch(headers!, this.options.runId, this.options.deviceId, selected);
    } catch (error) {
      try { transaction.abort(); } catch { /* transaction already completed */ }
      await done.catch(() => undefined);
      throw error;
    }
  }

  async ackThrough(runId: string, deviceId: string, seq: number): Promise<void> {
    if (runId !== this.options.runId || deviceId !== this.options.deviceId) {
      throw new Error("ACK identity does not match this integrity outbox");
    }
    const transaction = this.database.transaction(
      [RECORDS_STORE, META_STORE, EVIDENCE_DESCRIPTORS_STORE],
      "readwrite",
    );
    const done = transactionDone(transaction);
    const recordsStore = transaction.objectStore(RECORDS_STORE);
    const metaStore = transaction.objectStore(META_STORE);
    const descriptorStore = transaction.objectStore(EVIDENCE_DESCRIPTORS_STORE);
    try {
      const meta = await requestResult(
        metaStore.get([this.options.runId, this.options.deviceId]),
      ) as StoredMeta | undefined;
      const headers = meta?.inflightBatch;
      this.assertAttempt(meta);
      if (!meta || !headers) {
        throw new Error("ACK received without a claimed integrity batch");
      }
      if (!Number.isSafeInteger(seq)) {
        throw new Error("ACK cursor must be a safe integer");
      }
      const allRecords = sortBySeq(
        (await requestResult(recordsStore.getAll(recordRange(runId, deviceId))) as StoredRecord[]),
      );
      const claimed = allRecords.filter(
        (record) => record.batchId === headers.batchId && !record.acked && !record.blocked,
      );
      const firstClaimedSeq = claimed[0]?.seq;
      const lastClaimedSeq = claimed[claimed.length - 1]?.seq;
      if (this.options.attemptId) {
        if (seq < 0) throw new Error("ACK cursor must be nonnegative");
        // A stream cursor can lag a gapped batch or pass it after an earlier
        // hole closes. Preserve the full leased body until wholly acknowledged;
        // never prune records that were not part of this admitted batch.
        if (lastClaimedSeq !== undefined && seq >= lastClaimedSeq) {
          for (const record of claimed) {
            recordsStore.delete([runId, deviceId, record.seq]);
            for (const summary of record.evidenceDescriptors) {
              const descriptor = await requestResult(descriptorStore.get([
                runId, deviceId, summary.localDescriptorId,
              ])) as { batchAcked?: boolean } | undefined;
              if (descriptor) descriptorStore.put({ ...descriptor, batchAcked: true });
            }
          }
          delete meta.inflightBatch;
        }
        meta.ackedThroughSeq = Math.max(meta.ackedThroughSeq, seq);
        metaStore.put(meta);
        await done;
        return;
      }
      if (
        firstClaimedSeq === undefined
        || lastClaimedSeq === undefined
        || seq <= meta.ackedThroughSeq
        || seq < firstClaimedSeq
        || seq > lastClaimedSeq
      ) {
        throw new Error("ACK cursor is outside the claimed integrity batch");
      }
      const acknowledgedDescriptorIds = new Set<string>();
      for (const record of allRecords) {
        if (record.seq <= seq) {
          for (const descriptor of record.evidenceDescriptors) {
            acknowledgedDescriptorIds.add(descriptor.localDescriptorId);
          }
          recordsStore.delete([runId, deviceId, record.seq]);
        }
      }
      for (const localDescriptorId of acknowledgedDescriptorIds) {
        const descriptor = await requestResult(descriptorStore.get([
          runId,
          deviceId,
          localDescriptorId,
        ])) as { batchAcked?: boolean } | undefined;
        if (descriptor) descriptorStore.put({ ...descriptor, batchAcked: true });
      }
      meta.ackedThroughSeq = Math.max(meta.ackedThroughSeq, seq);
      if (seq < lastClaimedSeq) {
        // A partial acknowledgement changes the canonical range. The tail must
        // receive a fresh ID; only a no-ACK retry may reuse a batch identity.
        for (const record of claimed) {
          if (record.seq > seq) {
            delete record.batchId;
            recordsStore.put(record);
          }
        }
      }
      delete meta.inflightBatch;
      metaStore.put(meta);
      await done;
    } catch (error) {
      try { transaction.abort(); } catch { /* transaction already completed */ }
      await done.catch(() => undefined);
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
      if (!meta || meta.inflightBatch?.batchId !== batchId || failure.kind === "transient") {
        await done;
        return;
      }
      this.assertAttempt(meta);
      const allRecords = await requestResult(
        recordsStore.getAll(recordRange(this.options.runId, this.options.deviceId)),
      ) as StoredRecord[];
      for (const record of allRecords) {
        if (record.batchId === batchId && !record.acked) {
          record.blocked = { status: failure.status, message: failure.message };
          recordsStore.put(record);
        }
      }
      delete meta.inflightBatch;
      metaStore.put(meta);
      await done;
    } catch (error) {
      try { transaction.abort(); } catch { /* transaction already completed */ }
      await done.catch(() => undefined);
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

  async lastSequence(): Promise<number> {
    const transaction = this.database.transaction(META_STORE, "readonly");
    const done = transactionDone(transaction);
    const meta = await requestResult(transaction.objectStore(META_STORE).get([
      this.options.runId, this.options.deviceId,
    ])) as StoredMeta | undefined;
    await done;
    this.assertAttempt(meta);
    return (meta?.nextSeq ?? 1) - 1;
  }

  private assertAttempt(meta: StoredMeta | undefined): void {
    if (this.options.attemptId && meta?.attemptId !== this.options.attemptId) {
      throw new Error("Integrity attempt changed; local records remain under their original owner");
    }
  }
}
