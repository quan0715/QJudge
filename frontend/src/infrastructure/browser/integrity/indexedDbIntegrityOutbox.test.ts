import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExamIntegrityEvidenceDescriptor } from "@/core/entities/examIntegrity.entity";

import {
  IndexedDbIntegrityOutbox,
  type IndexedDbIntegrityOutboxOptions,
} from "./indexedDbIntegrityOutbox";
import { OpfsEvidenceStore } from "./opfsEvidenceStore";

const RUN_ID = "33333333-3333-3333-3333-333333333333";
const DEVICE_ID = "device-a";
let sequence = 0;
let now = 1_000;

const databaseNames = new Set<string>();

const openTestOutbox = async (overrides: Partial<IndexedDbIntegrityOutboxOptions> = {}) => {
  const databaseName = overrides.databaseName ?? `qjudge-integrity-test-${sequence++}`;
  databaseNames.add(databaseName);
  const options: IndexedDbIntegrityOutboxOptions = {
    runId: RUN_ID,
    participantId: 44,
    deviceId: DEVICE_ID,
    registryVersion: "2026-07-21.1",
    clientBuild: "frontend-test",
    databaseName,
    now: () => now,
    monotonicNow: () => now / 10,
    createId: () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`,
    ...overrides,
  };
  return IndexedDbIntegrityOutbox.open(options);
};

const baseSignal = (eventType: string, clientOccurredAtMs: number) => ({
  eventType,
  clientOccurredAtMs,
  payload: { eventType },
});

describe("resident immutable outbox", () => {
  it("allocates the fence and health sequence atomically and keeps it through partial ACK and reload", async () => {
    const options = { databaseName: `fence-proof-${sequence++}`, attemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", nextSequence: 1 };
    const first = await openTestOutbox(options);
    await first.append(baseSignal("focus_lost", 900));
    const record = await first.append({ eventType: "health_snapshot", clientOccurredAtMs: 1000, payload: {}, evidenceFenceBeforeMs: 800 });
    const batch = await first.claimBatch({ maxRecords: 200, maxBytes: 1048576 });
    await first.ackThrough(RUN_ID, DEVICE_ID, 1);
    await first.close();
    const second = await openTestOutbox(options);
    expect(await second.claimBatch({ maxRecords: 200, maxBytes: 1048576 })).toEqual(batch);
    await second.close();
    expect(record.payload.evidence_fence).toEqual({ version: "resident-evidence-fence-v1", attempt_id: options.attemptId, through_seq: 2, before_client_ms: 800 });
  });
  it("fences a still-open prior attempt after another owner rotates an empty stream", async () => {
    const databaseName = `resident-fence-${sequence++}`;
    const first = await openTestOutbox({ databaseName, attemptId: "attempt-a", nextSequence: 1 });
    const next = await openTestOutbox({ databaseName, attemptId: "attempt-b", nextSequence: 1 });
    let failure: unknown;
    try { await first.append(baseSignal("focus_lost", 1000)); } catch (error) { failure = error; }
    await first.close();
    await next.close();
    expect(failure).toBeInstanceOf(Error);
  });
  it("uses the server continuation when a same-attempt local stream is empty", async () => {
    const databaseName = `resident-empty-${sequence++}`;
    const options = { databaseName, attemptId: "attempt-a", nextSequence: 1 };
    const first = await openTestOutbox(options);
    await first.close();
    const next = await openTestOutbox({ ...options, nextSequence: 9 });
    const record = await next.append(baseSignal("focus_lost", 1000));
    await next.close();
    expect(record.seq).toBe(9);
  });
  it("refuses to relabel unresolved previous-attempt data and preserves its original body", async () => {
    const databaseName = `resident-attempt-${sequence++}`;
    const options = { databaseName, attemptId: "attempt-a", nextSequence: 1 };
    const first = await openTestOutbox(options);
    await first.append(baseSignal("focus_lost", 1000));
    const original = await first.claimBatch({ maxRecords: 200, maxBytes: 1048576 });
    await first.close();
    await expect(openTestOutbox({ ...options, attemptId: "attempt-b", nextSequence: 2 })).rejects.toThrow("previous integrity attempt");
    const restored = await openTestOutbox(options);
    const retry = await restored.claimBatch({ maxRecords: 200, maxBytes: 1048576 });
    await restored.close();
    expect(retry).toEqual(original);
  });
  it("preserves the entire claimed body after gap and partial ACK across reload", async () => {
    const databaseName = `resident-${sequence++}`;
    const options = { databaseName, attemptId: "attempt-a", nextSequence: 7 };
    const box = await openTestOutbox(options);
    await box.append(baseSignal("focus_lost", 1000));
    await box.append(baseSignal("focus_lost", 1001));
    const batch = await box.claimBatch({ maxRecords: 200, maxBytes: 1048576 });
    await box.close();
    expect(batch?.firstSeq).toBe(7);
    const pending = await openTestOutbox(options);
    try {
      await pending.ackThrough(RUN_ID, DEVICE_ID, 0);
      await pending.ackThrough(RUN_ID, DEVICE_ID, 7);
    } finally { await pending.close(); }
    const restored = await openTestOutbox(options);
    expect(await restored.claimBatch({ maxRecords: 200, maxBytes: 1048576 })).toEqual(batch);
    await restored.append(baseSignal("focus_lost", 1002));
    await restored.ackThrough(RUN_ID, DEVICE_ID, 30);
    expect((await restored.listPending()).map((record) => record.seq)).toEqual([9]);
    expect((await restored.claimBatch({ maxRecords: 200, maxBytes: 1048576 }))?.firstSeq).toBe(9);
    await restored.close();
  });
});

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

const openDatabase = (databaseName: string): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const evidenceDescriptor = (): ExamIntegrityEvidenceDescriptor => ({
  source: "screen_share",
  recordingSessionId: "55555555-5555-4555-8555-555555555555",
  chunkSeq: 1,
  isInitChunk: true,
  startAtMs: 1_000,
  endAtMs: 6_000,
  byteSize: 1_024,
  codec: "video/webm;codecs=vp8",
  contentType: "video/webm",
  sha256: "a".repeat(64),
  previousSha256: "",
  localDescriptorId: "44444444-4444-4444-8444-444444444444",
});

const storeDescriptor = async (
  databaseName: string,
  descriptor: ExamIntegrityEvidenceDescriptor,
  owner?: { attemptId: string; participantId: number },
): Promise<void> => {
  const database = await openDatabase(databaseName);
  try {
    const transaction = database.transaction("evidenceDescriptors", "readwrite");
    transaction.objectStore("evidenceDescriptors").put({
      ...descriptor,
      ...owner,
      runId: RUN_ID,
      deviceId: DEVICE_ID,
      batchAcked: false,
    });
    await transactionDone(transaction);
  } finally {
    database.close();
  }
};

const readStoredDescriptor = async (
  databaseName: string,
  localDescriptorId: string,
): Promise<{ batchAcked?: boolean } | undefined> => {
  const database = await openDatabase(databaseName);
  try {
    const transaction = database.transaction("evidenceDescriptors", "readonly");
    const descriptor = await requestResult(transaction.objectStore("evidenceDescriptors").get([
      RUN_ID,
      DEVICE_ID,
      localDescriptorId,
    ])) as { batchAcked?: boolean } | undefined;
    await transactionDone(transaction);
    return descriptor;
  } finally {
    database.close();
  }
};

const seededOutbox = async (count: number) => {
  const outbox = await openTestOutbox();
  for (let index = 0; index < count; index += 1) {
    await outbox.append(baseSignal("clipboard_action", 1_000 + index));
  }
  return outbox;
};

afterEach(async () => {
  await Promise.all(
    [...databaseNames].map(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        }),
    ),
  );
  databaseNames.clear();
  now = 1_000;
  vi.restoreAllMocks();
});

describe("IndexedDbIntegrityOutbox", () => {
  it("allocates sequence and persists before returning", async () => {
    const outbox = await openTestOutbox();
    const first = await outbox.append(baseSignal("exam_entered", 1_000));
    const second = await outbox.append(baseSignal("clipboard_action", 1_001));

    expect([first.seq, second.seq]).toEqual([1, 2]);
    await outbox.close();

    const reopened = await IndexedDbIntegrityOutbox.open({
      runId: RUN_ID,
      participantId: 44,
      deviceId: DEVICE_ID,
      registryVersion: "2026-07-21.1",
      clientBuild: "frontend-test",
      databaseName: [...databaseNames][0],
      now: () => now,
      monotonicNow: () => now / 10,
      createId: () => "00000000-0000-4000-8000-000000000999",
    });
    expect((await reopened.listPending()).map((item) => item.seq)).toEqual([1, 2]);
    await reopened.close();
  });

  it("reopens the shared database after secondary IndexedDB evidence storage upgrades its schema", async () => {
    const outbox = await openTestOutbox();
    const databaseName = [...databaseNames][0]!;
    await outbox.close();

    const evidenceStore = await OpfsEvidenceStore.open({
      runId: RUN_ID,
      deviceId: DEVICE_ID,
      databaseName,
      opfs: null,
    });
    await evidenceStore.close();

    const reopened = await openTestOutbox({ databaseName });
    await reopened.append(baseSignal("exam_entered", 1_000));
    expect((await reopened.listPending()).map((record) => record.eventType)).toEqual(["exam_entered"]);
    await reopened.close();
  });

  it("reuses an exact batch until a partial ACK, then gives the released tail a new ID", async () => {
    const outbox = await seededOutbox(5);
    const firstClaim = await outbox.claimBatch({ maxRecords: 3, maxBytes: 1_048_576 });
    const retryClaim = await outbox.claimBatch({ maxRecords: 3, maxBytes: 1_048_576 });

    expect(retryClaim?.batchId).toBe(firstClaim?.batchId);
    expect(retryClaim?.records.map((item) => item.seq)).toEqual([1, 2, 3]);

    await outbox.ackThrough(RUN_ID, DEVICE_ID, 2);
    expect((await outbox.listPending()).map((item) => item.seq)).toEqual([3, 4, 5]);
    const tailClaim = await outbox.claimBatch({ maxRecords: 3, maxBytes: 1_048_576 });
    expect(tailClaim?.batchId).not.toBe(firstClaim?.batchId);
    expect(tailClaim?.records.map((item) => item.seq)).toEqual([3, 4, 5]);
    await outbox.close();
  });

  it("reopens an inflight batch with its immutable original headers", async () => {
    const outbox = await seededOutbox(1);
    const original = await outbox.claimBatch({ maxRecords: 200, maxBytes: 1_048_576 });
    const databaseName = [...databaseNames].at(-1)!;
    await outbox.close();

    const reopened = await openTestOutbox({
      databaseName,
      participantId: 999,
      registryVersion: "2026-08-01.1",
      clientBuild: "frontend-next",
    });
    const retried = await reopened.claimBatch({ maxRecords: 1, maxBytes: 1 });

    expect(retried).toMatchObject({
      batchId: original?.batchId,
      participantId: 44,
      registryVersion: "2026-07-21.1",
      clientBuild: "frontend-test",
    });
    expect(retried?.records).toEqual(original?.records);
    await reopened.close();
  });

  it("deletes only records through the acknowledged cursor", async () => {
    const outbox = await seededOutbox(50);
    await outbox.claimBatch({ maxRecords: 200, maxBytes: 1_048_576 });

    await outbox.ackThrough(RUN_ID, DEVICE_ID, 42);

    expect((await outbox.listPending()).map((item) => item.seq)).toEqual(
      Array.from({ length: 8 }, (_, index) => index + 43),
    );
    await outbox.close();
  });

  it.each([false, true])("ACKs a descriptor-bearing snapshot and marks its local descriptor durable (resident=%s)", async (resident) => {
    const outbox = await openTestOutbox(resident ? { attemptId: "attempt-a", nextSequence: 1 } : {});
    const databaseName = [...databaseNames][0]!;
    const descriptor = evidenceDescriptor();
    await storeDescriptor(databaseName, descriptor, resident ? { attemptId: "attempt-a", participantId: 44 } : undefined);
    await outbox.append({
      ...baseSignal("health_snapshot", 1_000),
      evidenceDescriptors: [descriptor],
    });

    const batch = await outbox.claimBatch({ maxRecords: 200, maxBytes: 1_048_576 });
    await outbox.ackThrough(RUN_ID, DEVICE_ID, batch!.lastSeq);

    expect(await outbox.listPending()).toEqual([]);
    await outbox.close();
    expect(await readStoredDescriptor(databaseName, descriptor.localDescriptorId)).toMatchObject({
      batchAcked: true,
    });
    await outbox.close();
  });

  it("never ACK-marks media owned by a prior attempt even when a summary names it", async () => {
    const outbox = await openTestOutbox({ attemptId: "attempt-new", nextSequence: 1 });
    const databaseName = [...databaseNames][0]!;
    const descriptor = evidenceDescriptor();
    await storeDescriptor(databaseName, descriptor, { attemptId: "attempt-old", participantId: 44 });
    await outbox.append({ ...baseSignal("health_snapshot", 1000), evidenceDescriptors: [descriptor] });
    const batch = await outbox.claimBatch({ maxRecords: 200, maxBytes: 1048576 });
    await outbox.ackThrough(RUN_ID, DEVICE_ID, batch!.lastSeq);
    await outbox.close();
    expect(await readStoredDescriptor(databaseName, descriptor.localDescriptorId)).toMatchObject({ batchAcked: false });
  });

  it("keeps offline records with their original occurrence timestamps", async () => {
    const outbox = await openTestOutbox();
    await outbox.append(baseSignal("mouse_leave_triggered", 1_000));
    now += 65_000;

    const [record] = await outbox.listPending();
    expect(record.clientOccurredAtMs).toBe(1_000);
    expect(record.clientRecordedAtMs).toBeGreaterThanOrEqual(1_000);
    await outbox.close();
  });

  it("marks a permanent failure without deleting its records", async () => {
    const outbox = await seededOutbox(1);
    const batch = await outbox.claimBatch({ maxRecords: 200, maxBytes: 1_048_576 });

    await outbox.failBatch(batch!.batchId, { kind: "permanent", status: 422 });

    expect((await outbox.listPending()).map((item) => item.seq)).toEqual([1]);
    expect(await outbox.claimBatch({ maxRecords: 200, maxBytes: 1_048_576 })).toBeNull();
    await outbox.close();
  });

  it("caps a caller's record limit at the protocol maximum of 200", async () => {
    const outbox = await seededOutbox(201);

    const batch = await outbox.claimBatch({ maxRecords: 201, maxBytes: 1_048_576 });

    expect(batch?.records).toHaveLength(200);
    expect(batch?.lastSeq).toBe(200);
    await outbox.close();
  });

  it("rejects an oversized payload before it is admitted to durable storage", async () => {
    const outbox = await openTestOutbox();

    await expect(outbox.append({
      eventType: "clipboard_action",
      clientOccurredAtMs: 1_000,
      payload: { contents: "x".repeat(32 * 1024) },
    })).rejects.toThrow("32 KiB");

    expect(await outbox.listPending()).toEqual([]);
    await outbox.close();
  });

  it("does not mutate durable state for malformed, stale, or out-of-range ACK cursors", async () => {
    const outbox = await seededOutbox(3);
    const claimed = await outbox.claimBatch({ maxRecords: 3, maxBytes: 1_048_576 });

    for (const invalidCursor of [0, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 4]) {
      await expect(outbox.ackThrough(RUN_ID, DEVICE_ID, invalidCursor)).rejects.toThrow();
      expect((await outbox.listPending()).map((item) => item.seq)).toEqual([1, 2, 3]);
    }
    expect((await outbox.claimBatch({ maxRecords: 3, maxBytes: 1_048_576 }))?.batchId).toBe(
      claimed?.batchId,
    );
    await outbox.close();
  });
});
