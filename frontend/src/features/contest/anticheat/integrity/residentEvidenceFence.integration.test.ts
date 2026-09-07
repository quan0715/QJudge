import "fake-indexeddb/auto";
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, describe, expect, it } from "vitest";
import { OpfsEvidenceStore } from "@/infrastructure/browser/integrity/opfsEvidenceStore";

describe("resident evidence fence storage integration", () => {
  const names: string[] = [];
  afterEach(async () => {
    await Promise.all(names.splice(0).map((name) => new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    })));
  });

  it("keeps a ten-minute 800 kbps stream below both caps and preserves the latest minute", async () => {
    const { IndexedDbIntegrityOutbox } = await import("@/infrastructure/browser/integrity/indexedDbIntegrityOutbox");
    const { EvidenceCoordinator } = await import("@/features/contest/anticheat/integrity/evidenceCoordinator");
    const { examIntegrityRepository } = await import("@/infrastructure/api/repositories/examIntegrity.repository");
    const databaseName = `long-exam-${crypto.randomUUID()}`;
    names.push(databaseName);
    const scope = { run_id: crypto.randomUUID(), participant_id: 44, device_id: "device-a", attempt_id: crypto.randomUUID() };
    const store = await OpfsEvidenceStore.open({ runId: scope.run_id, deviceId: scope.device_id, participantId: 44, attemptId: scope.attempt_id, databaseName, opfs: null });
    const box = await IndexedDbIntegrityOutbox.open({ runId: scope.run_id, deviceId: scope.device_id, participantId: 44,
      attemptId: scope.attempt_id, nextSequence: 1, registryVersion: "v1", clientBuild: "test", databaseName });
    const coordinator = new EvidenceCoordinator({ contestId: "1", runId: scope.run_id, store, repository: {} as never });
    const originalFetch = globalThis.fetch;
    // Transport fixture models an already continuously processed, healthy stream.
    globalThis.fetch = async (_url, init) => {
      const batch = JSON.parse(init!.body as string).observations;
      const fence = batch.records.at(-1).payload.evidence_fence;
      return new Response(JSON.stringify({ acked_through_seq: batch.last_seq, processed_through_seq: batch.last_seq,
        pending_commands: [], evidence_fence_version: fence.version, release_evidence_before_ms: fence.before_client_ms }), { status: 200 });
    };
    try {
      for (let segment = 1; segment <= 121; segment += 1) {
        const end = 1000000 + segment * 5000;
        await store.putChunk({ source: "screen_share", recordingSessionId: "healthy", epochId: "epoch", chunkSeq: segment,
          isInitChunk: segment === 1, previousSha256: "", startAtMs: end - 5000, endAtMs: end,
          codec: "video/webm", bytes: new NodeBlob([new Uint8Array(500000)]) as unknown as Blob });
        expect(await coordinator.enforceCapacity("screen_share", { minimumLocalBufferMs: 60000, localCapMs: 300000, localCapBytesPerSource: 100000000 })).toBe(true);
        const descriptors = await store.pendingDescriptorSummaries();
        const record = await box.append({ eventType: "health_snapshot", clientOccurredAtMs: end, payload: {}, evidenceDescriptors: descriptors, evidenceFenceBeforeMs: end - 60000 });
        await store.markReported(descriptors, record.seq);
        const batch = await box.claimBatch({ maxRecords: 200, maxBytes: 1048576 });
        const ack = await examIntegrityRepository.sendBatch("1", batch!, undefined, scope);
        await box.ackThrough(scope.run_id, scope.device_id, ack.ackedThroughSeq);
        await coordinator.releaseBefore(ack.releaseEvidenceBeforeMs);
        const retained = await store.listDescriptors();
        expect(retained.reduce((sum, d) => sum + d.byteSize, 0)).toBeLessThanOrEqual(7000000);
        if (segment >= 13) expect(retained.reduce((sum, d) => sum + d.endAtMs - d.startAtMs, 0)).toBeGreaterThanOrEqual(60000);
      }
    } finally { globalThis.fetch = originalFetch; await Promise.all([store.close(), box.close()]); }
  }, 15000);

  it("keeps prior-attempt and unowned media outside a new attempt's positive release", async () => {
    const { EvidenceCoordinator } = await import("@/features/contest/anticheat/integrity/evidenceCoordinator");
    const databaseName = `scope-${crypto.randomUUID()}`;
    names.push(databaseName);
    const base = { runId: "run", deviceId: "device", databaseName, opfs: null };
    const old = await OpfsEvidenceStore.open({ ...base, participantId: 1, attemptId: "old" });
    const next = await OpfsEvidenceStore.open({ ...base, participantId: 1, attemptId: "new" });
    const legacy = await OpfsEvidenceStore.open(base);
    const input = { source: "screen_share" as const, recordingSessionId: "session", epochId: "epoch", chunkSeq: 1,
      isInitChunk: true, previousSha256: "", startAtMs: 100, endAtMs: 200, codec: "video/webm", bytes: new NodeBlob(["original"]) as unknown as Blob };
    try {
      const prior = await old.putChunk(input);
      const unowned = await legacy.putChunk(input);
      const current = await next.putChunk(input);
      const owner = new EvidenceCoordinator({ contestId: "1", runId: "run", store: next, repository: {} as never });
      await owner.releaseBefore(100000);
      expect((await next.listDescriptors()).map(d => d.localDescriptorId)).toEqual([current.localDescriptorId]);
      await expect(next.deleteDescriptor(prior)).rejects.toThrow();
      expect(await old.getBlob(prior)).not.toBeNull();
      expect(await legacy.getBlob(unowned)).not.toBeNull();
      await old.putChunk({ ...input, recordingSessionId: "old-long", startAtMs: 1000, endAtMs: 301000 });
      expect(await owner.enforceCapacity("screen_share", { minimumLocalBufferMs: 60000, localCapMs: 300000, localCapBytesPerSource: 100000000 })).toBe(false);
    } finally { await Promise.all([old.close(), next.close(), legacy.close()]); }
  });

});
