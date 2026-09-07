import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { ResidentIntegritySession } from "./residentIntegritySession";
import { IndexedDbIntegrityOutbox } from "@/infrastructure/browser/integrity/indexedDbIntegrityOutbox";
import { OpfsEvidenceStore } from "@/infrastructure/browser/integrity/opfsEvidenceStore";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(["network", "append", "open", "capacity", "recorder"])("reports local loss separately from retryable %s failure without rejecting answer signals", async (failure) => {
  const scope = { run_id: crypto.randomUUID(), participant_id: 44, device_id: "device-a", attempt_id: crypto.randomUUID() };
  vi.spyOn(OpfsEvidenceStore, "open").mockResolvedValue({ reconcile: async () => {},
    listDescriptors: async () => [], pendingDescriptorSummaries: async () => [], markReported: async () => {}, close: async () => {},
  } as unknown as OpfsEvidenceStore);
  if (failure === "open") vi.spyOn(IndexedDbIntegrityOutbox, "open").mockRejectedValue(new Error("unavailable"));
  if (failure === "append") vi.spyOn(IndexedDbIntegrityOutbox.prototype, "append").mockRejectedValue(new Error("quota"));
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const recorderStart = vi.fn(() => { throw new Error("inactive stream"); });
  vi.stubGlobal("MediaRecorder", class {
    static isTypeSupported() { return true; }
    mimeType = "video/webm";
    state = "inactive";
    addEventListener = vi.fn();
    start = recorderStart;
    stop = vi.fn();
  });
  const localLoss = vi.fn();
  const session = new ResidentIntegritySession({ contestId: "1", scope, nextSequence: 1,
    run: { id: scope.run_id, participantId: 44, computeState: "stopped", health: "unhealthy",
      registrySnapshot: { version: "v1", definitions: {} }, policySnapshot: {
        device_policy: { desktop: { enabled: true, sources: { screen_share: { enabled: true } } } },
      }, devicePolicy: {} as never },
    onGap: vi.fn(), onLocalLoss: localLoss, onProgress: vi.fn(), snapshotProvider: () => ({ pageVisible: true, online: true,
      fullscreen: false, screenCapture: "disabled", webcamCapture: "disabled", activeSourceDescriptors: [] }) });
  await session.start();
  if (failure === "recorder") {
    session.setSources({ screen_share: { active: true, getVideoTracks: () => [{ applyConstraints: async () => {}, addEventListener: vi.fn(), getSettings: () => ({}) }] } as unknown as MediaStream });
    await vi.waitFor(() => expect(recorderStart).toHaveBeenCalledOnce());
    await session.setMode("drain");
  }
  const writes = Array.from({ length: failure === "capacity" ? 129 : 1 }, () => session.emitter.emit({ eventType: "focus_lost", clientOccurredAtMs: 1000, payload: {} }));
  await expect(Promise.all(writes)).resolves.toBeDefined();
  await session.flush();
  if (failure === "network") {
    expect(fetch).toHaveBeenCalled();
    expect(localLoss).not.toHaveBeenCalled();
  }
  else expect(localLoss).toHaveBeenCalled();
  await session.close();
});

it("retries a gapped original batch through the real repository and scopes late evidence-only requests", async () => {
  const scope = { run_id: crypto.randomUUID(), participant_id: 44, device_id: "device-a", attempt_id: crypto.randomUUID() };
  const box = await IndexedDbIntegrityOutbox.open({ runId: scope.run_id, participantId: 44, deviceId: scope.device_id,
    attemptId: scope.attempt_id, nextSequence: 7, registryVersion: "v1", clientBuild: "frontend" });
  await box.append({ eventType: "focus_lost", clientOccurredAtMs: 1000, payload: {} });
  await box.close();
  vi.spyOn(OpfsEvidenceStore, "open").mockResolvedValue({ reconcile: async () => {},
    listDescriptors: async () => [], pendingDescriptorSummaries: async () => [], close: async () => {},
  } as unknown as OpfsEvidenceStore);
  const bodies: Record<string, any>[] = [];
  let received = 0;
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    const body = JSON.parse(init.body); bodies.push(body);
    if (body.evidence?.unavailable?.length) return new Response(JSON.stringify({ uploads: [], completions: [] }), { status: 200 });
    received += 1;
    return new Response(JSON.stringify({ acked_through_seq: received === 1 ? 0 : 19,
      processed_through_seq: 0, release_evidence_before_ms: 0, upload_status: "pending",
      pending_commands: received === 1 ? [{ command_id: "retain-1", incident_id: "incident-1", event_id: "44", sources: ["screen_share"], start_at_ms: 0, end_at_ms: 1 }] : [],
    }), { status: 200 });
  }));
  const session = new ResidentIntegritySession({ contestId: "1", scope, nextSequence: 8, mode: "drain",
    run: { id: scope.run_id, participantId: 44, computeState: "stopped", health: "unhealthy",
      registrySnapshot: { version: "v1", definitions: {} }, policySnapshot: {}, devicePolicy: {} as never },
    onGap: vi.fn(), onProgress: vi.fn(), snapshotProvider: () => ({ pageVisible: true, online: true,
      fullscreen: false, screenCapture: "disabled", webcamCapture: "disabled", activeSourceDescriptors: [] }) });
  await session.start();
  await session.flush();
  await session.flush();
  const batches = bodies.filter((body) => body.observations);
  expect(batches).toHaveLength(2);
  expect(batches[1].observations).toEqual(batches[0].observations);
  expect(bodies.find((body) => body.evidence?.unavailable?.length)?.upload_scope).toEqual(scope);
  expect(bodies.find((body) => body.final_seq !== undefined)?.final_seq).toBe(7);
  await session.close();
});

it("keeps the same durable owner through capture to drain and declares final after admitted writes", async () => {
  const scope = { run_id: crypto.randomUUID(), participant_id: 44, device_id: "device-a", attempt_id: crypto.randomUUID() };
  const open = vi.spyOn(IndexedDbIntegrityOutbox, "open");
  vi.spyOn(OpfsEvidenceStore, "open").mockRejectedValue(new Error("storage unavailable"));
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    const body = JSON.parse(init.body); bodies.push(body);
    return new Response(JSON.stringify({ acked_through_seq: 100,
      processed_through_seq: 100, pending_commands: [], release_evidence_before_ms: 0,
      upload_status: body.final_seq === undefined ? "pending" : "complete" }), { status: 200 });
  }));
  const gap = vi.fn();
  const session = new ResidentIntegritySession({ contestId: "1", scope, nextSequence: 7,
    run: { id: scope.run_id, participantId: 44, computeState: "stopped", health: "unhealthy",
      registrySnapshot: { version: "v1", definitions: {} }, policySnapshot: {}, devicePolicy: {} as never },
    onGap: gap, onProgress: vi.fn(), snapshotProvider: () => ({ pageVisible: true, online: true,
      fullscreen: false, screenCapture: "disabled", webcamCapture: "disabled", activeSourceDescriptors: [] }),
  });
  await session.start();
  const write = session.emitter.emit({ eventType: "focus_lost", clientOccurredAtMs: 1000, payload: {} });
  await session.setMode("drain");
  await write;
  await session.emitter.emit({ eventType: "focus_lost", clientOccurredAtMs: 1001, payload: {} });
  await session.flush();
  await session.flush();
  expect(open).toHaveBeenCalledTimes(1);
  expect(gap).toHaveBeenCalled();
  expect(bodies.every((body) => JSON.stringify(body.upload_scope) === JSON.stringify(scope))).toBe(true);
  const marker = bodies.find((body) => body.final_seq !== undefined);
  expect(marker?.final_seq).toBeGreaterThanOrEqual(7);
  const snapshotsAfterMarker = bodies.slice(bodies.indexOf(marker!)).flatMap((body) => (body.observations as {records?: {event_type: string}[]})?.records ?? []);
  expect(snapshotsAfterMarker).toHaveLength(0);
  await session.close();
});
