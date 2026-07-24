import { describe, expect, it, vi } from "vitest";

import { EvidenceCoordinator } from "./EvidenceCoordinator";

describe("EvidenceCoordinator", () => {
  it("uploads only chunks intersecting the requested incident window", async () => {
    const descriptors = [
      { localDescriptorId: "one", source: "screen_share", startAtMs: 970_000, endAtMs: 975_000 },
      { localDescriptorId: "two", source: "screen_share", startAtMs: 995_000, endAtMs: 1_000_000 },
      { localDescriptorId: "three", source: "screen_share", startAtMs: 1_015_000, endAtMs: 1_020_000 },
    ];
    const requestEvidenceUploads = vi.fn().mockResolvedValue({
      uploads: [
        { chunkId: "chunk-2", chunkSeq: 2, source: "screen_share", objectKey: "chunk-2", status: "verified", putUrl: null, requiredHeaders: {} },
        { chunkId: "chunk-3", chunkSeq: 3, source: "screen_share", objectKey: "chunk-3", status: "verified", putUrl: null, requiredHeaders: {} },
      ],
    });
    const store = {
      listDescriptors: async () => descriptors,
      protect: vi.fn(),
      releaseProtection: vi.fn(),
      markVerified: vi.fn(),
    };
    const coordinator = new EvidenceCoordinator({
      contestId: "contest-a", runId: "run-a",
      store: store as never,
      repository: { requestEvidenceUploads } as never,
    });

    await coordinator.retain({
      commandId: "retain-1", incidentId: "incident-a", eventId: "17",
      sources: ["screen_share"], startAtMs: 990_000, endAtMs: 1_020_000,
    });

    expect(requestEvidenceUploads).toHaveBeenCalledWith("contest-a", expect.objectContaining({
      chunks: expect.arrayContaining([
        expect.objectContaining({ localDescriptorId: "two" }),
        expect.objectContaining({ localDescriptorId: "three" }),
      ]),
    }));
  });
});
