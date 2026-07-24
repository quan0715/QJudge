import { describe, expect, it, vi } from "vitest";
import type {
  EvidenceManifestRequest,
  EvidenceRetainCommand,
  ExamIntegrityEvidenceDescriptor,
} from "@/core/entities/examIntegrity.entity";
import type { StoredEvidenceDescriptor } from "@/infrastructure/browser/integrity/OpfsEvidenceStore";

import { EvidenceCoordinator } from "./EvidenceCoordinator";

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

const successfulManifest = () => vi.fn(async (
  _contestId: string,
  request: EvidenceManifestRequest,
) => ({
  uploads: request.chunks.map((chunk: ExamIntegrityEvidenceDescriptor) => ({
    chunkId: `chunk-${chunk.chunkSeq}`,
    chunkSeq: chunk.chunkSeq,
    source: chunk.source,
    objectKey: `integrity/${chunk.recordingSessionId}/${chunk.chunkSeq}.webm`,
    status: "verified",
    putUrl: null,
    requiredHeaders: {},
  })),
}));

const coordinatorStore = (descriptors: StoredEvidenceDescriptor[]) => ({
  listDescriptors: vi.fn().mockResolvedValue(descriptors),
  protect: vi.fn().mockResolvedValue(undefined),
  releaseProtection: vi.fn().mockResolvedValue(undefined),
  markVerified: vi.fn().mockResolvedValue(undefined),
});

describe("EvidenceCoordinator", () => {
  it("uploads only chunks intersecting the requested incident window", async () => {
    const descriptors = [
      storedDescriptor({ localDescriptorId: "one", chunkSeq: 1, startAtMs: 970_000, endAtMs: 975_000 }),
      storedDescriptor({ localDescriptorId: "two", chunkSeq: 2, startAtMs: 995_000, endAtMs: 1_000_000 }),
      storedDescriptor({ localDescriptorId: "three", chunkSeq: 3, startAtMs: 1_000_000, endAtMs: 1_020_000 }),
    ];
    const requestEvidenceUploads = successfulManifest();
    const reportEvidenceUnavailable = vi.fn().mockResolvedValue(undefined);
    const store = coordinatorStore(descriptors);
    const coordinator = new EvidenceCoordinator({
      contestId: "contest-a", runId: "run-a",
      store: store as never,
      repository: { requestEvidenceUploads, reportEvidenceUnavailable } as never,
    });

    await coordinator.retain(retainCommand());

    expect(requestEvidenceUploads).toHaveBeenCalledWith("contest-a", expect.objectContaining({
      chunks: expect.arrayContaining([
        expect.objectContaining({ localDescriptorId: "two" }),
        expect.objectContaining({ localDescriptorId: "three" }),
      ]),
    }));
    expect(reportEvidenceUnavailable).not.toHaveBeenCalled();
  });

  it("uploads available fragments then terminally reports an evicted middle chunk", async () => {
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
    const requestEvidenceUploads = successfulManifest();
    const reportEvidenceUnavailable = vi.fn().mockResolvedValue(undefined);
    const store = coordinatorStore(descriptors);
    const coordinator = new EvidenceCoordinator({
      contestId: "contest-a", runId: "run-a",
      store: store as never,
      repository: { requestEvidenceUploads, reportEvidenceUnavailable } as never,
    });

    await coordinator.retain(retainCommand({ startAtMs: 1_000, endAtMs: 15_000 }));

    expect(requestEvidenceUploads).toHaveBeenCalledWith("contest-a", expect.objectContaining({
      chunks: expect.arrayContaining([
        expect.objectContaining({ localDescriptorId: "before" }),
        expect.objectContaining({ localDescriptorId: "after" }),
      ]),
    }));
    expect(reportEvidenceUnavailable).toHaveBeenCalledWith("contest-a", {
      runId: "run-a",
      incidentId: "incident-a",
      eventId: 17,
      source: "screen_share",
      reason: "local_chunk_unavailable",
    });
    expect(store.releaseProtection).toHaveBeenCalledWith("retain-1");
  });

  it("terminally reports an uncovered recorder gap between otherwise available chunks", async () => {
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
    const requestEvidenceUploads = successfulManifest();
    const reportEvidenceUnavailable = vi.fn().mockResolvedValue(undefined);
    const coordinator = new EvidenceCoordinator({
      contestId: "contest-a", runId: "run-a",
      store: coordinatorStore(descriptors) as never,
      repository: { requestEvidenceUploads, reportEvidenceUnavailable } as never,
    });

    await coordinator.retain(retainCommand({ startAtMs: 1_000, endAtMs: 11_000 }));

    expect(reportEvidenceUnavailable).toHaveBeenCalledWith("contest-a", expect.objectContaining({
      source: "screen_share",
      reason: "local_window_incomplete",
    }));
  });
});
