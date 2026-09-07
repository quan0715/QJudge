import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IndexedDbIntegrityOutbox } from "@/infrastructure/browser/integrity/indexedDbIntegrityOutbox";
import { examIntegrityRepository } from "@/infrastructure/api/repositories/examIntegrity.repository";
import { IntegrityTransport } from "./integrityTransport";

describe("resident schedule synchronization retry", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["resident_schedule_sync_pending", "genuine_conflict"])(
    "retains immutable records and retries only the schedule conflict: %s",
    async (code) => {
      const databaseName = `schedule-retry-${crypto.randomUUID()}`;
      const scope = { run_id: crypto.randomUUID(), participant_id: 44,
        device_id: "device-a", attempt_id: crypto.randomUUID() };
      let now = 1000;
      const box = await IndexedDbIntegrityOutbox.open({ databaseName,
        runId: scope.run_id, participantId: scope.participant_id, deviceId: scope.device_id,
        attemptId: scope.attempt_id, registryVersion: "v1", clientBuild: "test",
        nextSequence: 1, now: () => now, monotonicNow: () => now / 10 });
      const bodies: string[] = [];
      const progress: number[] = [];
      let pollFailed = false;
      vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
        bodies.push(init.body as string);
        const payload = JSON.parse(init.body as string);
        const rejectPoll = !payload.observations && !pollFailed;
        if (rejectPoll) pollFailed = true;
        if (bodies.length === 1 || rejectPoll) return new Response(JSON.stringify({ error: {
          code, message: "Resident schedule synchronization pending.",
        } }), { status: 409 });
        return new Response(JSON.stringify({ acked_through_seq: payload.observations?.last_seq ?? 2,
          processed_through_seq: payload.observations?.last_seq ?? 2, pending_commands: [],
          release_evidence_before_ms: 0, upload_status: "pending" }), { status: 200 });
      });
      const transport = new IntegrityTransport({ contestId: "1", outbox: box,
        repository: { sendBatch: (id, batch, signal) => examIntegrityRepository.sendBatch(id, batch, signal, scope) },
        controlPoll: signal => examIntegrityRepository.pollUpload("1", scope, undefined, signal),
        mode: "drain", snapshotProvider: () => {
          throw new Error("Drain must not create capture snapshots");
        }, now: () => now, random: () => 0.5,
        isOnline: () => true, onProgress: ack => progress.push(ack.ackedThroughSeq) });
      try {
        await box.append({ eventType: "focus_lost", clientOccurredAtMs: 900, payload: {} });
        transport.start();
        await transport.whenIdle();
        expect(await box.listPending()).toHaveLength(1);
        expect(progress).toEqual([]);
        now += 5000;
        transport.requestTick();
        await transport.whenIdle();
        if (code === "genuine_conflict") {
          expect(bodies.filter(body => JSON.parse(body).observations)).toHaveLength(1);
          expect(await box.listPending()).toHaveLength(1);
          expect(progress).toEqual([]);
          return;
        }
        expect(bodies).toHaveLength(2);
        expect(bodies[1]).toBe(bodies[0]);
        expect(JSON.parse(bodies[1]).observations.records[0].client_occurred_at_ms).toBe(900);
        expect(JSON.parse(bodies[1]).upload_scope).toEqual(scope);
        expect(await box.listPending()).toEqual([]);
        expect(progress).toEqual([1]);
        const next = await box.append({ eventType: "focus_restored", clientOccurredAtMs: now, payload: {} });
        expect(next.seq).toBe(2);
        transport.requestTick();
        await transport.whenIdle();
        expect(progress).toEqual([1, 2]);
        transport.requestTick();
        await transport.whenIdle();
        expect(progress).toEqual([1, 2]); // Rejected progress cannot ACK/release.
        now += 5000;
        transport.requestTick();
        await transport.whenIdle();
        expect(progress).toEqual([1, 2, 2]);
        expect(bodies[4]).toBe(bodies[3]);
      } finally {
        transport.stop();
        await transport.whenIdle();
        await box.close();
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(databaseName);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }
    },
  );
});
