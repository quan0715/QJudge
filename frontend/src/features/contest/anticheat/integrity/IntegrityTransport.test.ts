import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ClaimedIntegrityBatch,
  ExamIntegrityRecord,
} from "@/core/entities/examIntegrity.entity";
import type {
  AppendIntegritySignal,
  BatchFailure,
  ExamIntegrityOutbox,
} from "@/core/ports/examIntegrity.port";

import { IntegrityTransport } from "./IntegrityTransport";

const RUN_ID = "33333333-3333-3333-3333-333333333333";
const DEVICE_ID = "device-a";

class MemoryOutbox implements ExamIntegrityOutbox {
  private nextSeq = 1;
  private batchId: string | null = null;
  private readonly records: ExamIntegrityRecord[] = [];
  readonly appendedRecords: ExamIntegrityRecord[] = [];

  async append(signal: AppendIntegritySignal): Promise<ExamIntegrityRecord> {
    const record: ExamIntegrityRecord = {
      eventId: `00000000-0000-4000-8000-${String(this.nextSeq).padStart(12, "0")}`,
      seq: this.nextSeq++,
      kind: signal.eventType === "state_snapshot" ? "state_snapshot" : "event",
      eventType: signal.eventType,
      eventSchemaVersion: 1,
      clientOccurredAtMs: signal.clientOccurredAtMs,
      clientRecordedAtMs: signal.clientOccurredAtMs,
      monotonicMs: signal.clientOccurredAtMs,
      payload: signal.payload,
      evidenceDescriptors: [],
    };
    this.records.push(record);
    this.appendedRecords.push(record);
    return record;
  }

  async claimBatch(): Promise<ClaimedIntegrityBatch | null> {
    if (this.records.length === 0) return null;
    this.batchId ??= "22222222-2222-2222-2222-222222222222";
    return {
      schemaVersion: 1,
      batchId: this.batchId,
      runId: RUN_ID,
      participantId: 44,
      deviceId: DEVICE_ID,
      registryVersion: "2026-07-21.1",
      firstSeq: this.records[0].seq,
      lastSeq: this.records[this.records.length - 1].seq,
      records: [...this.records],
      clientBuild: "frontend-test",
    };
  }

  async ackThrough(_runId: string, _deviceId: string, seq: number): Promise<void> {
    while (this.records[0]?.seq <= seq) this.records.shift();
    if (this.records.length === 0) this.batchId = null;
  }

  async failBatch(_batchId: string, _failure: BatchFailure): Promise<void> {}

  async listPending(): Promise<ExamIntegrityRecord[]> {
    return [...this.records];
  }

  async close(): Promise<void> {}
}

describe("IntegrityTransport", () => {
  let now = 1_000;
  let online = true;
  let outbox: MemoryOutbox;
  let sendBatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    outbox = new MemoryOutbox();
    sendBatch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const createTransport = () =>
    new IntegrityTransport({
      contestId: "contest-a",
      outbox,
      repository: { sendBatch },
      snapshotProvider: () => ({
        pageVisible: true,
        online,
        fullscreen: true,
        screenCapture: "active",
        webcamCapture: "disabled",
        activeSourceDescriptors: [],
      }),
      now: () => now,
      random: () => 0,
      isOnline: () => online,
      eventTarget: window,
    });

  it("records exactly one state snapshot for each started transport tick", async () => {
    sendBatch.mockResolvedValue({
      ackedThroughSeq: 1,
      pendingCommands: [],
      releaseEvidenceBeforeMs: 0,
    });
    const transport = createTransport();

    transport.start();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(outbox.appendedRecords.filter((item) => item.kind === "state_snapshot")).toHaveLength(3);
    expect(sendBatch).toHaveBeenCalledTimes(3);
    transport.stop();
  });

  it("keeps ordinary detector records in sequence without merging them", async () => {
    await outbox.append({
      eventType: "mouse_leave_triggered",
      clientOccurredAtMs: 900,
      payload: { first: true },
    });
    await outbox.append({
      eventType: "mouse_leave_triggered",
      clientOccurredAtMs: 901,
      payload: { second: true },
    });
    sendBatch.mockResolvedValue({
      ackedThroughSeq: 3,
      pendingCommands: [],
      releaseEvidenceBeforeMs: 0,
    });
    const transport = createTransport();

    transport.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(sendBatch.mock.calls[0][1].records.map((record: ExamIntegrityRecord) => record.eventType)).toEqual([
      "mouse_leave_triggered",
      "mouse_leave_triggered",
      "state_snapshot",
    ]);
    transport.stop();
  });

  it("replays offline records using their original timestamps when online returns", async () => {
    online = false;
    const transport = createTransport();

    transport.start();
    now += 65_000;
    await vi.advanceTimersByTimeAsync(65_000);
    expect(sendBatch).not.toHaveBeenCalled();

    online = true;
    sendBatch.mockResolvedValue({
      ackedThroughSeq: 14,
      pendingCommands: [],
      releaseEvidenceBeforeMs: 0,
    });
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);

    const firstBatch = sendBatch.mock.calls[0][1] as ClaimedIntegrityBatch;
    expect(firstBatch.records[0].clientOccurredAtMs).toBe(1_000);
    expect(firstBatch.records).toHaveLength(15);
    transport.stop();
  });

  it("retries a lost ACK with the same batch identity and retains records on 503", async () => {
    sendBatch
      .mockRejectedValueOnce(Object.assign(new Error("unavailable"), { status: 503 }))
      .mockResolvedValueOnce({
        ackedThroughSeq: 1,
        pendingCommands: [],
        releaseEvidenceBeforeMs: 0,
      });
    const transport = createTransport();

    transport.start();
    await vi.advanceTimersByTimeAsync(0);
    expect((await outbox.listPending()).map((item) => item.seq)).toContain(1);
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(sendBatch.mock.calls[1][1].batchId).toBe(sendBatch.mock.calls[0][1].batchId);
    expect((await outbox.listPending()).map((item) => item.seq)).not.toContain(1);
    transport.stop();
  });

  it("does not schedule a second timer when started twice", async () => {
    sendBatch.mockResolvedValue({
      ackedThroughSeq: 1,
      pendingCommands: [],
      releaseEvidenceBeforeMs: 0,
    });
    const transport = createTransport();

    transport.start();
    transport.start();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(sendBatch).toHaveBeenCalledTimes(2);
    transport.stop();
  });
});
