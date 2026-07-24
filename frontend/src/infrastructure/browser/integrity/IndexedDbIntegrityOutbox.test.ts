import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  IndexedDbIntegrityOutbox,
  type IndexedDbIntegrityOutboxOptions,
} from "./IndexedDbIntegrityOutbox";

const RUN_ID = "33333333-3333-3333-3333-333333333333";
const DEVICE_ID = "device-a";
let sequence = 0;
let now = 1_000;

const databaseNames = new Set<string>();

const openTestOutbox = async () => {
  const databaseName = `qjudge-integrity-test-${sequence++}`;
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
  };
  return IndexedDbIntegrityOutbox.open(options);
};

const baseSignal = (eventType: string, clientOccurredAtMs: number) => ({
  eventType,
  clientOccurredAtMs,
  payload: { eventType },
});

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

  it("reuses one batch id until ack and deletes only covered records", async () => {
    const outbox = await seededOutbox(5);
    const firstClaim = await outbox.claimBatch({ maxRecords: 3, maxBytes: 1_048_576 });
    const retryClaim = await outbox.claimBatch({ maxRecords: 3, maxBytes: 1_048_576 });

    expect(retryClaim?.batchId).toBe(firstClaim?.batchId);
    expect(retryClaim?.records.map((item) => item.seq)).toEqual([1, 2, 3]);

    await outbox.ackThrough(RUN_ID, DEVICE_ID, 2);
    expect((await outbox.listPending()).map((item) => item.seq)).toEqual([3, 4, 5]);
    await outbox.close();
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
});
