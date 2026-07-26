import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ClaimedIntegrityBatch,
  ExamIntegrityRecord,
} from "@/core/entities/examIntegrity.entity";
import type {
  AppendIntegritySignal,
  BatchFailure,
  ExamIntegrityOutbox,
} from "@/core/ports/examIntegrity.repository";

import { IntegrityTransport, type IntegrityTransportOptions } from "./integrityTransport";

const RUN_ID = "33333333-3333-3333-3333-333333333333";
const DEVICE_ID = "device-a";

class MemoryOutbox implements ExamIntegrityOutbox {
  private nextSeq = 1;
  private batchId: string | null = null;
  private claimedRecords: ExamIntegrityRecord[] | null = null;
  private readonly records: ExamIntegrityRecord[] = [];
  readonly appendedRecords: ExamIntegrityRecord[] = [];
  readonly failures: Array<{ batchId: string; failure: BatchFailure }> = [];

  async append(signal: AppendIntegritySignal): Promise<ExamIntegrityRecord> {
    const record: ExamIntegrityRecord = {
      eventId: `00000000-0000-4000-8000-${String(this.nextSeq).padStart(12, "0")}`,
      seq: this.nextSeq++,
      kind: signal.eventType === "health_snapshot" ? "health_snapshot" : "event",
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
    this.claimedRecords ??= [...this.records];
    return {
      schemaVersion: 1,
      batchId: this.batchId,
      runId: RUN_ID,
      participantId: 44,
      deviceId: DEVICE_ID,
      registryVersion: "2026-07-21.1",
      firstSeq: this.claimedRecords[0].seq,
      lastSeq: this.claimedRecords[this.claimedRecords.length - 1].seq,
      records: [...this.claimedRecords],
      clientBuild: "frontend-test",
    };
  }

  async ackThrough(_runId: string, _deviceId: string, seq: number): Promise<void> {
    while (this.records[0]?.seq <= seq) this.records.shift();
    if (this.claimedRecords && seq >= this.claimedRecords[this.claimedRecords.length - 1].seq) {
      this.batchId = null;
      this.claimedRecords = null;
    }
  }

  async failBatch(batchId: string, failure: BatchFailure): Promise<void> {
    this.failures.push({ batchId, failure });
  }

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

  const createTransport = (overrides: Partial<IntegrityTransportOptions> = {}) =>
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
        health: {
          displayApi: { status: "healthy" },
          evidenceSources: {
            screen_share: { status: "active" },
            webcam: { status: "disabled" },
          },
          evidenceBuffer: {
            screen_share: { status: "healthy" },
            webcam: { status: "disabled" },
          },
        },
      }),
      now: () => now,
      random: () => 0,
      isOnline: () => online,
      eventTarget: window,
      ...overrides,
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

    expect(outbox.appendedRecords.filter((item) => item.kind === "health_snapshot")).toHaveLength(3);
    expect(sendBatch).toHaveBeenCalledTimes(3);
    transport.stop();
  });

  it("dispatches one ACK's pending evidence commands without serially blocking the batch", async () => {
    const pendingCommands = [
      {
        commandId: "retain-1",
        incidentId: "incident-a",
        eventId: "17",
        sources: ["screen_share" as const],
        startAtMs: 900,
        endAtMs: 1_000,
      },
      {
        commandId: "retain-2",
        incidentId: "incident-a",
        eventId: "18",
        sources: ["webcam" as const],
        startAtMs: 900,
        endAtMs: 1_000,
      },
    ];
    sendBatch.mockResolvedValue({
      ackedThroughSeq: 1,
      pendingCommands,
      releaseEvidenceBeforeMs: 0,
    });
    let releaseCallbacks: (() => void) | undefined;
    const callbackBarrier = new Promise<void>((resolve) => { releaseCallbacks = resolve; });
    const onPendingCommand = vi.fn(() => callbackBarrier);
    const transport = createTransport({ onPendingCommand });

    transport.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(onPendingCommand).toHaveBeenCalledTimes(2);
    releaseCallbacks?.();
    await vi.advanceTimersByTimeAsync(0);
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
      "health_snapshot",
    ]);
    transport.stop();
  });

  it("replays offline records using their original timestamps when online returns", async () => {
    online = false;
    const transport = createTransport();

    transport.start();
    await vi.advanceTimersByTimeAsync(0);
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
    await vi.advanceTimersByTimeAsync(0);
    expect((await outbox.listPending()).map((item) => item.seq)).toContain(1);
    now += 5_000;
    await vi.advanceTimersByTimeAsync(5_000);
    now += 5_000;
    await vi.advanceTimersByTimeAsync(5_000);

    expect(sendBatch.mock.calls[1][1].batchId).toBe(sendBatch.mock.calls[0][1].batchId);
    expect((await outbox.listPending()).map((item) => item.seq)).not.toContain(1);
    transport.stop();
  });

  it("keeps an exam-not-in-progress conflict retryable for an allowed rejoin", async () => {
    sendBatch.mockRejectedValue(Object.assign(new Error("exam closed"), {
      status: 409,
      response: {
        status: 409,
        data: {
          error: {
            code: "exam_not_in_progress",
            message: "Exam is not currently accepting integrity events.",
          },
        },
      },
    }));
    const transport = createTransport();

    transport.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(outbox.failures).toEqual([{
      batchId: "22222222-2222-2222-2222-222222222222",
      failure: {
        kind: "transient",
        status: 409,
        message: "exam closed",
      },
    }]);
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

  it("stops immediately on a typed authentication failure", async () => {
    const authenticationFailure = vi.fn();
    sendBatch.mockRejectedValue(Object.assign(new Error("expired"), { status: 401 }));
    const transport = createTransport({ onAuthenticationFailure: authenticationFailure });

    transport.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(authenticationFailure).toHaveBeenCalledTimes(1);
    expect(sendBatch).toHaveBeenCalledTimes(1);
  });

  it("aborts a hung request, releases the tick, and retries the same leased batch", async () => {
    let requestSignal: AbortSignal | undefined;
    sendBatch
      .mockImplementationOnce((_contestId: string, _batch: ClaimedIntegrityBatch, signal?: AbortSignal) => {
        requestSignal = signal;
        return new Promise(() => undefined);
      })
      .mockResolvedValueOnce({
        ackedThroughSeq: 1,
        pendingCommands: [],
        releaseEvidenceBeforeMs: 0,
      });
    const transport = createTransport({ requestTimeoutMs: 1_000 });

    transport.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(requestSignal?.aborted).toBe(true);

    now += 5_000;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(sendBatch).toHaveBeenCalledTimes(2);
    expect(sendBatch.mock.calls[1][1]).toEqual(sendBatch.mock.calls[0][1]);
    transport.stop();
  });

  it("flushes a prior failed batch immediately when the browser comes online", async () => {
    sendBatch
      .mockRejectedValueOnce(Object.assign(new Error("offline"), { status: 503 }))
      .mockResolvedValueOnce({
        ackedThroughSeq: 1,
        pendingCommands: [],
        releaseEvidenceBeforeMs: 0,
      });
    const transport = createTransport();

    transport.start();
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);

    expect(sendBatch).toHaveBeenCalledTimes(2);
    expect(sendBatch.mock.calls[1][1]).toEqual(sendBatch.mock.calls[0][1]);
    transport.stop();
  });

  it("does not send after stop when a pending outbox claim resolves", async () => {
    let resolveClaim: ((batch: ClaimedIntegrityBatch | null) => void) | undefined;
    const pendingClaim = new Promise<ClaimedIntegrityBatch | null>((resolve) => {
      resolveClaim = resolve;
    });
    const originalClaim = outbox.claimBatch.bind(outbox);
    vi.spyOn(outbox, "claimBatch").mockReturnValue(pendingClaim);
    const transport = createTransport();

    transport.start();
    await vi.advanceTimersByTimeAsync(0);
    transport.stop();
    resolveClaim?.(await originalClaim());
    await vi.advanceTimersByTimeAsync(0);

    expect(sendBatch).not.toHaveBeenCalled();
  });

  it("does not append a snapshot after stop while evidence descriptors are still loading", async () => {
    let resolveDescriptors: ((descriptors: []) => void) | undefined;
    const pendingDescriptors = new Promise<[]>(resolve => {
      resolveDescriptors = resolve;
    });
    const transport = createTransport({
      evidenceDescriptorsProvider: () => pendingDescriptors,
    });

    transport.start();
    await vi.advanceTimersByTimeAsync(0);
    transport.stop();
    let idle = false;
    const idleWait = transport.whenIdle().then(() => { idle = true; });
    expect(idle).toBe(false);
    resolveDescriptors?.([]);
    await vi.advanceTimersByTimeAsync(0);
    await idleWait;

    expect(outbox.appendedRecords).toHaveLength(0);
    expect(sendBatch).not.toHaveBeenCalled();
  });
});
