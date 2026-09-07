import "fake-indexeddb/auto";
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, expect, it, vi } from "vitest";
import { ResidentIntegritySession } from "./residentIntegritySession";
import { IndexedDbIntegrityOutbox } from "@/infrastructure/browser/integrity/indexedDbIntegrityOutbox";
import { OpfsEvidenceStore } from "@/infrastructure/browser/integrity/opfsEvidenceStore";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("stops capture after periodic release storage failure without rejecting answer signals", async () => {
  const recorders: Recorder[] = [];
  class Recorder extends EventTarget {
    static isTypeSupported() { return true; }
    state = "inactive";
    mimeType = "video/webm";
    start() { this.state = "recording"; recorders.push(this); }
    stop() { this.state = "inactive"; this.dispatchEvent(new Event("stop")); }
  }
  vi.stubGlobal("MediaRecorder", Recorder);
  const descriptor = { endAtMs: 200, startAtMs: 100, batchAcked: true, retainCommandIds: [], uploadStatus: "local" };
  const remove = vi.fn().mockRejectedValue(new DOMException("remove denied", "NoModificationAllowedError"));
  vi.spyOn(OpfsEvidenceStore, "open").mockResolvedValue({ reconcile: async () => {}, listDescriptors: async () => [descriptor],
    pendingDescriptorSummaries: async () => [], markReported: async () => {}, deleteDescriptor: remove, close: async () => {},
  } as unknown as OpfsEvidenceStore);
  let requests = 0;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ acked_through_seq: ++requests,
    processed_through_seq: requests, pending_commands: [], evidence_fence_version: "resident-evidence-fence-v1",
    release_evidence_before_ms: requests === 1 ? 0 : 100000 }), { status: 200 })));
  const onLocalLoss = vi.fn();
  const scope = { run_id: crypto.randomUUID(), participant_id: 44, device_id: "device", attempt_id: crypto.randomUUID() };
  const session = new ResidentIntegritySession({ contestId: "1", scope, nextSequence: 1,
    run: { id: scope.run_id, participantId: 44, computeState: "stopped", health: "unhealthy", registrySnapshot: { version: "v1", definitions: {} },
      policySnapshot: { device_policy: { desktop: { enabled: true, sources: { screen_share: { enabled: true } } } } }, devicePolicy: {} as never },
    onGap: vi.fn(), onLocalLoss, onProgress: vi.fn(), snapshotProvider: () => ({ pageVisible: true, online: true,
      fullscreen: false, screenCapture: "disabled", webcamCapture: "disabled", activeSourceDescriptors: [] }) });
  try {
    await session.start(); await vi.waitFor(() => expect(requests).toBe(1));
    session.setSources({ screen_share: { active: true, getVideoTracks: () => [{ applyConstraints: async () => {}, addEventListener() {}, getSettings: () => ({}) }] } as unknown as MediaStream });
    await vi.waitFor(() => expect(recorders).toHaveLength(1));
    await session.flush();
    expect(remove).toHaveBeenCalledOnce();
    expect(onLocalLoss).toHaveBeenCalled();
    expect(recorders.every(recorder => recorder.state === "inactive")).toBe(true);
    await expect(session.emitter.emit({ eventType: "focus_lost", clientOccurredAtMs: 1000, payload: {} })).resolves.toBeUndefined();
    await session.flush();
    expect(remove).toHaveBeenCalledOnce();
  } finally { await session.close(); }
});

it("keeps event upload alive but never starts a capture writer after startup storage failure", async () => {
  const start = vi.fn();
  vi.stubGlobal("MediaRecorder", class extends EventTarget {
    static isTypeSupported() { return true; }
    state = "inactive";
    start() { start(); this.state = "recording"; }
    stop() { this.state = "inactive"; this.dispatchEvent(new Event("stop")); }
  });
  vi.spyOn(OpfsEvidenceStore.prototype, "reconcile").mockRejectedValue(new Error("storage unavailable"));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ acked_through_seq: 0, processed_through_seq: 0, pending_commands: [] }), { status: 200 })));
  const onLocalLoss = vi.fn();
  const scope = { run_id: crypto.randomUUID(), participant_id: 44, device_id: "device", attempt_id: crypto.randomUUID() };
  const session = new ResidentIntegritySession({ contestId: "1", scope, nextSequence: 1,
    run: { id: scope.run_id, participantId: 44, computeState: "stopped", health: "unhealthy", registrySnapshot: { version: "v1", definitions: {} },
      policySnapshot: { device_policy: { desktop: { enabled: true, sources: { screen_share: { enabled: true } } } } }, devicePolicy: {} as never },
    onGap: vi.fn(), onLocalLoss, onProgress: vi.fn(), snapshotProvider: () => ({ pageVisible: true, online: true,
      fullscreen: false, screenCapture: "disabled", webcamCapture: "disabled", activeSourceDescriptors: [] }) });
  await session.start();
  session.setSources({ screen_share: { active: true, getVideoTracks: () => [{ applyConstraints: async () => {}, addEventListener() {}, getSettings: () => ({}) }] } as unknown as MediaStream });
  await session.emitter.emit({ eventType: "focus_lost", clientOccurredAtMs: 100, payload: {} });
  await session.close();
  expect(onLocalLoss).toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
});

it("orders admitted signals before drain while the final recorder callback and storage delay the fence", async () => {
  const stopped: Recorder[] = [];
  const started: Recorder[] = [];
  class Recorder extends EventTarget {
    static isTypeSupported() { return true; }
    state = "inactive";
    mimeType = "video/webm";
    start() { this.state = "recording"; started.push(this); }
    stop() { this.state = "inactive"; stopped.push(this); }
    finish() {
      const data = new Event("dataavailable");
      Object.assign(data, { data: new NodeBlob(["final video"]) });
      this.dispatchEvent(data); this.dispatchEvent(new Event("stop"));
    }
  }
  vi.stubGlobal("MediaRecorder", Recorder);
  let releaseStorage!: () => void;
  const storageGate = new Promise<void>(resolve => { releaseStorage = resolve; });
  const putChunk = OpfsEvidenceStore.prototype.putChunk;
  vi.spyOn(OpfsEvidenceStore.prototype, "putChunk").mockImplementation(async function(input) {
    await storageGate; return putChunk.call(this, input);
  });
  const scope = { run_id: crypto.randomUUID(), participant_id: 44, device_id: "device-a", attempt_id: crypto.randomUUID() };
  const bodies: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    const body = JSON.parse(init.body); bodies.push(body);
    return new Response(JSON.stringify({ acked_through_seq: body.observations?.last_seq ?? 3,
      processed_through_seq: 0, pending_commands: [], release_evidence_before_ms: 0, upload_status: "pending" }), { status: 200 });
  }));
  const session = new ResidentIntegritySession({ contestId: "1", scope, nextSequence: 1,
    run: { id: scope.run_id, participantId: 44, computeState: "stopped", health: "unhealthy", registrySnapshot: { version: "v1", definitions: {} },
      policySnapshot: { device_policy: { desktop: { enabled: true, sources: { screen_share: { enabled: true } } } } }, devicePolicy: {} as never },
    onGap: vi.fn(), onProgress: vi.fn(), snapshotProvider: () => ({ pageVisible: true, online: true,
      fullscreen: false, screenCapture: "disabled", webcamCapture: "disabled", activeSourceDescriptors: [] }) });
  await session.start();
  await vi.waitFor(() => expect(bodies).toHaveLength(1));
  expect(bodies[0].observations.records[0].payload.evidence_fence.through_seq).toBe(1);
  session.setSources({ screen_share: { active: true, getVideoTracks: () => [{ applyConstraints: async () => {}, addEventListener: () => {}, getSettings: () => ({}) }] } as unknown as MediaStream });
  await vi.waitFor(() => expect(started).toHaveLength(1));
  await session.emitter.emit({ eventType: "focus_lost", clientOccurredAtMs: 100, payload: {} });
  const flushing = session.flush();
  await vi.waitFor(() => expect(stopped).toHaveLength(1));
  // Admitted while encoder is waiting: it must remain durable and ordered.
  await session.emitter.emit({ eventType: "focus_restored", clientOccurredAtMs: 101, payload: {} });
  let drained = false;
  const draining = session.setMode("drain").then(() => { drained = true; });
  stopped[0].finish();
  await Promise.resolve();
  expect(drained).toBe(false);
  expect(bodies.some(body => body.final_seq !== undefined)).toBe(false);
  releaseStorage();
  await Promise.all([draining, flushing]);
  await session.flush(); await session.flush();
  await session.close();
  const records = bodies.flatMap(body => body.observations?.records ?? []);
  expect(records.map(record => [record.seq, record.event_type])).toEqual([[1, "health_snapshot"], [2, "focus_lost"], [3, "focus_restored"]]);
  expect(bodies.find(body => body.final_seq !== undefined)?.final_seq).toBe(3);
});

it("cancels stuck evidence PUTs through submit drain and expiry cleanup without deleting durable evidence", async () => {
  const scope = { run_id: crypto.randomUUID(), participant_id: 44, device_id: "device-a", attempt_id: crypto.randomUUID() };
  const descriptor = { source: "screen_share", recordingSessionId: "recording", chunkSeq: 1, localDescriptorId: "saved",
    startAtMs: 100, endAtMs: 200, localAvailability: "available", uploadStatus: "local", isInitChunk: false, retainCommandIds: [] };
  const blob = new Blob(["durable original evidence"]);
  const store = { reconcile: async () => {}, listDescriptors: async () => [descriptor], pendingDescriptorSummaries: async () => [],
    markReported: async () => {}, protect: vi.fn(), getBlob: vi.fn(async () => blob), markRequested: vi.fn(),
    markUnavailable: vi.fn(), markVerified: vi.fn(), deleteDescriptor: vi.fn(), releaseProtection: vi.fn(), close: vi.fn() };
  vi.spyOn(OpfsEvidenceStore, "open").mockResolvedValue(store as unknown as OpfsEvidenceStore);
  const requests: Record<string, any>[] = [];
  const puts: AbortSignal[] = [];
  let first = true;
  const command = { command_id: "retain", incident_id: "incident", event_id: "44", sources: ["screen_share"], start_at_ms: 100, end_at_ms: 200 };
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    if (init.method === "PUT") {
      puts.push(init.signal);
      return new Promise<Response>((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted PUT")), { once: true }));
    }
    const body = JSON.parse(init.body); requests.push(body);
    if (body.evidence?.manifests.length) return new Response(JSON.stringify({ uploads: [{ chunk_id: "chunk", chunk_seq: 1, source: "screen_share",
      object_key: "integrity/recording/1.webm", status: "requested", put_url: "https://upload.test", required_headers: {} }], completions: [] }), { status: 200 });
    const commands = first || body.final_seq !== undefined ? [command] : [];
    first = false;
    return new Response(JSON.stringify({ acked_through_seq: 100, processed_through_seq: 100,
      pending_commands: commands, release_evidence_before_ms: 0, upload_status: "pending" }), { status: 200 });
  }));
  const session = new ResidentIntegritySession({ contestId: "1", scope, nextSequence: 1,
    run: { id: scope.run_id, participantId: 44, computeState: "stopped", health: "unhealthy",
      registrySnapshot: { version: "v1", definitions: {} }, policySnapshot: {}, devicePolicy: {} as never },
    onGap: vi.fn(), onProgress: vi.fn(), snapshotProvider: () => ({ pageVisible: true, online: true,
      fullscreen: false, screenCapture: "disabled", webcamCapture: "disabled", activeSourceDescriptors: [] }) });
  await session.start();
  await vi.waitFor(() => expect(puts).toHaveLength(1));
  await session.emitter.emit({ eventType: "focus_lost", clientOccurredAtMs: 150, payload: {} });
  await session.setMode("drain");
  expect(puts[0].aborted).toBe(true);
  // Drive subsequent drain tick after the newly saved event is ACKed.
  const draining = session.flush();
  await vi.waitFor(() => expect(puts).toHaveLength(2));
  expect(requests.some((request) => request.final_seq !== undefined)).toBe(true);
  await session.setMode("off");
  await draining;
  await session.close();
  expect(puts[1].aborted).toBe(true);
  expect(store.close).toHaveBeenCalledOnce();
  expect(await store.getBlob()).toBe(blob);
  expect(store.deleteDescriptor).not.toHaveBeenCalled();
  expect(store.markUnavailable).not.toHaveBeenCalled();
  expect(store.markVerified).not.toHaveBeenCalled();
  expect(requests.filter((request) => request.evidence).every((request) => request.evidence.completions.length === 0)).toBe(true);
});

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
