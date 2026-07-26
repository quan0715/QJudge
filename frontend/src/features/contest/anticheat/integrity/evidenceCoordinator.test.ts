import { describe, expect, it, vi } from "vitest";
import type {
  EvidenceCheckpointRequest,
  EvidenceRetainCommand,
} from "@/core/entities/examIntegrity.entity";
import type { StoredEvidenceDescriptor } from "@/infrastructure/browser/integrity/opfsEvidenceStore";

import { EvidenceCoordinator } from "./evidenceCoordinator";

const storedDescriptor = (
  overrides: Partial<StoredEvidenceDescriptor> = {},
): StoredEvidenceDescriptor => ({
  runId: "run-a",
  deviceId: "device-a",
  source: "screen_share",
  recordingSessionId: "session-a",
  epochId: "epoch-a",
  chunkSeq: 1,
  isInitChunk: false,
  startAtMs: 995_000,
  endAtMs: 1_000_000,
  byteSize: 1_024,
  codec: "video/webm;codecs=vp8",
  contentType: "video/webm",
  sha256: "a".repeat(64),
  previousSha256: "",
  localDescriptorId: "one",
  actualWidth: 1280,
  actualHeight: 720,
  actualFps: 5,
  actualBitrate: 800_000,
  gapBeforeMs: 0,
  localAvailability: "available",
  retainCommandIds: [],
  uploadStatus: "local",
  verifiedAtMs: null,
  batchAcked: true,
  createdAtMs: 1_000,
  reportedAtSeq: 1,
  opfsPath: "exam-integrity/run-a/device-a/screen_share/session-a/1.webm",
  ...overrides,
});

const retainCommand = (overrides: Partial<EvidenceRetainCommand> = {}): EvidenceRetainCommand => ({
  commandId: "retain-1",
  incidentId: "incident-a",
  eventId: "17",
  sources: ["screen_share"],
  startAtMs: 995_000,
  endAtMs: 1_020_000,
  ...overrides,
});

const successfulCheckpoint = () => vi.fn(async (
  _contestId: string,
  request: EvidenceCheckpointRequest,
) => ({
  uploads: request.manifests.flatMap((manifest) => manifest.chunks).map((chunk) => ({
    chunkId: `chunk-${chunk.chunkSeq}`,
    chunkSeq: chunk.chunkSeq,
    source: chunk.source,
    objectKey: `integrity/${chunk.recordingSessionId}/${chunk.chunkSeq}.webm`,
    status: "verified",
    putUrl: null,
    requiredHeaders: {},
  })),
  completions: request.completions.map((chunkId) => ({ chunkId, status: "verified" })),
}));

const coordinatorStore = (descriptors: StoredEvidenceDescriptor[]) => ({
  listDescriptors: vi.fn().mockResolvedValue(descriptors),
  getBlob: vi.fn().mockResolvedValue(new Blob(["evidence"], { type: "video/webm" })),
  deleteDescriptor: vi.fn().mockResolvedValue(undefined),
  protect: vi.fn().mockResolvedValue(undefined),
  releaseProtection: vi.fn().mockResolvedValue(undefined),
  markRequested: vi.fn().mockResolvedValue(undefined),
  markVerified: vi.fn().mockResolvedValue(undefined),
  markUnavailable: vi.fn().mockResolvedValue(undefined),
});

describe("EvidenceCoordinator", () => {
  it("caps recorded duration without treating time between sessions as video", async () => {
    const coordinator = new EvidenceCoordinator({
      contestId: "contest-a",
      runId: "run-a",
      store: coordinatorStore([
        storedDescriptor({ startAtMs: 1_000, endAtMs: 6_000 }),
        storedDescriptor({
          localDescriptorId: "later",
          recordingSessionId: "session-b",
          startAtMs: 781_000,
          endAtMs: 786_000,
        }),
      ]) as never,
      repository: {} as never,
    });

    await expect(coordinator.enforceCapacity("screen_share", {
      minimumLocalBufferMs: 60_000,
      localCapMs: 300_000,
      localCapBytesPerSource: 100_000_000,
    })).resolves.toBe(true);
  });

  it("uploads only chunks intersecting the requested incident window", async () => {
    const descriptors = [
      storedDescriptor({ localDescriptorId: "one", chunkSeq: 1, startAtMs: 970_000, endAtMs: 975_000 }),
      storedDescriptor({ localDescriptorId: "two", chunkSeq: 2, startAtMs: 995_000, endAtMs: 1_000_000 }),
      storedDescriptor({ localDescriptorId: "three", chunkSeq: 3, startAtMs: 1_000_000, endAtMs: 1_020_000 }),
    ];
    const submitEvidenceCheckpoint = successfulCheckpoint();
    const store = coordinatorStore(descriptors);
    const coordinator = new EvidenceCoordinator({
      contestId: "contest-a", runId: "run-a",
      store: store as never,
      repository: { submitEvidenceCheckpoint },
    });

    await coordinator.retain(retainCommand());

    expect(submitEvidenceCheckpoint).toHaveBeenCalledWith("contest-a", {
      manifests: [expect.objectContaining({
        chunks: expect.arrayContaining([
          expect.objectContaining({ localDescriptorId: "two" }),
          expect.objectContaining({ localDescriptorId: "three" }),
        ]),
      })],
      completions: [],
      unavailable: [],
    });
  });

  it("does not decide coverage before the requested evidence window has ended", async () => {
    vi.useFakeTimers();
    const submitEvidenceCheckpoint = successfulCheckpoint();
    const coordinator = new EvidenceCoordinator({
      contestId: "contest-a",
      runId: "run-a",
      store: coordinatorStore([storedDescriptor()]) as never,
      repository: { submitEvidenceCheckpoint },
      now: () => 1_000,
    });

    const work = coordinator.retain(retainCommand({ startAtMs: 995, endAtMs: 1_020 }));
    await Promise.resolve();

    expect(submitEvidenceCheckpoint).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20);
    await work;
    vi.useRealTimers();
  });

  it("uploads available fragments without separately reporting partial coverage", async () => {
    const descriptors = [
      storedDescriptor({ localDescriptorId: "before", chunkSeq: 1, startAtMs: 1_000, endAtMs: 5_000 }),
      storedDescriptor({
        localDescriptorId: "evicted",
        chunkSeq: 2,
        startAtMs: 5_000,
        endAtMs: 10_000,
        localAvailability: "evicted",
      }),
      storedDescriptor({ localDescriptorId: "after", chunkSeq: 3, startAtMs: 10_000, endAtMs: 15_000 }),
    ];
    const submitEvidenceCheckpoint = successfulCheckpoint();
    const store = coordinatorStore(descriptors);
    const coordinator = new EvidenceCoordinator({
      contestId: "contest-a", runId: "run-a",
      store: store as never,
      repository: { submitEvidenceCheckpoint },
    });

    await coordinator.retain(retainCommand({ startAtMs: 1_000, endAtMs: 15_000 }));

    expect(submitEvidenceCheckpoint).toHaveBeenCalledWith("contest-a", {
      manifests: [expect.objectContaining({
        chunks: expect.arrayContaining([
          expect.objectContaining({ localDescriptorId: "before" }),
          expect.objectContaining({ localDescriptorId: "after" }),
        ]),
      })],
      completions: [],
      unavailable: [],
    });
    expect(store.releaseProtection).toHaveBeenCalledWith("retain-1");
  });

  it("does not report unavailable when recorder gaps still leave playable chunks", async () => {
    const descriptors = [
      storedDescriptor({ localDescriptorId: "before", chunkSeq: 1, startAtMs: 1_000, endAtMs: 5_000 }),
      storedDescriptor({
        localDescriptorId: "after",
        chunkSeq: 2,
        startAtMs: 6_000,
        endAtMs: 11_000,
        gapBeforeMs: 1_000,
      }),
    ];
    const submitEvidenceCheckpoint = successfulCheckpoint();
    const coordinator = new EvidenceCoordinator({
      contestId: "contest-a", runId: "run-a",
      store: coordinatorStore(descriptors) as never,
      repository: { submitEvidenceCheckpoint },
    });

    await coordinator.retain(retainCommand({ startAtMs: 1_000, endAtMs: 11_000 }));

    expect(submitEvidenceCheckpoint).toHaveBeenCalledWith("contest-a", expect.objectContaining({
      unavailable: [],
    }));
  });

  it("bulk-reports empty sources and completes uploaded chunks in two checkpoints", async () => {
    const submitEvidenceCheckpoint = vi.fn()
      .mockResolvedValueOnce({
        uploads: [{
          chunkId: "chunk-1",
          chunkSeq: 1,
          source: "screen_share",
          objectKey: "integrity/session-a/1.webm",
          status: "requested",
          putUrl: "https://r2.example/chunk-1",
          requiredHeaders: { "Content-Type": "video/webm" },
        }],
        completions: [],
      })
      .mockResolvedValueOnce({
        uploads: [],
        completions: [{ chunkId: "chunk-1", status: "verified" }],
      });
    const store = coordinatorStore([storedDescriptor()]);
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const coordinator = new EvidenceCoordinator({
      contestId: "contest-a",
      runId: "run-a",
      store: store as never,
      repository: { submitEvidenceCheckpoint },
      fetchFn,
    });

    await coordinator.retain(retainCommand({
      sources: ["screen_share", "webcam"],
    }));

    expect(submitEvidenceCheckpoint).toHaveBeenNthCalledWith(1, "contest-a", {
      manifests: [expect.objectContaining({
        chunks: [expect.objectContaining({ source: "screen_share" })],
      })],
      completions: [],
      unavailable: [{
        runId: "run-a",
        incidentId: "incident-a",
        eventId: 17,
        source: "webcam",
        reason: "local_window_empty",
      }],
    });
    expect(submitEvidenceCheckpoint).toHaveBeenNthCalledWith(2, "contest-a", {
      manifests: [],
      completions: ["chunk-1"],
      unavailable: [],
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(store.markVerified).toHaveBeenCalledWith(["one"], expect.any(Number));
  });

  it("coalesces evidence commands from one ACK into one manifest checkpoint", async () => {
    const submitEvidenceCheckpoint = successfulCheckpoint();
    const store = coordinatorStore([storedDescriptor()]);
    const coordinator = new EvidenceCoordinator({
      contestId: "contest-a",
      runId: "run-a",
      store: store as never,
      repository: { submitEvidenceCheckpoint },
    });

    await Promise.all([
      coordinator.retain(retainCommand({ commandId: "retain-1", eventId: "17" })),
      coordinator.retain(retainCommand({ commandId: "retain-2", eventId: "18" })),
    ]);

    expect(submitEvidenceCheckpoint).toHaveBeenCalledTimes(1);
    expect(submitEvidenceCheckpoint).toHaveBeenCalledWith("contest-a", {
      manifests: [expect.objectContaining({
        incidentId: "incident-a",
        chunks: [expect.objectContaining({ localDescriptorId: "one" })],
      })],
      completions: [],
      unavailable: [],
    });
  });
});
