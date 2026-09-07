import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IndexedDbIntegrityOutbox } from "@/infrastructure/browser/integrity/indexedDbIntegrityOutbox";
import { OpfsEvidenceStore } from "@/infrastructure/browser/integrity/opfsEvidenceStore";
import { applyIntegrityHealthUpdate, contestIntegritySourceFiles, initialHealthSnapshot } from "./useIntegrityRuntime";
import { ResidentIntegritySession } from "./residentIntegritySession";
import { IntegrityTransport } from "./integrityTransport";
import integrityRuntimeSource from "./useIntegrityRuntime.ts?raw";
import { assertFrontendSignalsInRegistry, FRONTEND_INTEGRITY_SIGNAL_IDS } from "./frontendIntegritySignals";

const frontendRegistryDefinitions = Object.fromEntries(
  FRONTEND_INTEGRITY_SIGNAL_IDS.map(signal => [
    signal, { signals: { triggered: signal, escalated: "", restored: "" } },
  ]),
);

const outboxMock = () => ({
  append: vi.fn().mockResolvedValue({ seq: 1 }),
  lastSequence: vi.fn().mockResolvedValue(1),
  close: vi.fn().mockResolvedValue(undefined),
});
const evidenceMock = () => ({
  close: vi.fn().mockResolvedValue(undefined),
  reconcile: vi.fn().mockResolvedValue(undefined),
  listDescriptors: vi.fn().mockResolvedValue([]),
  pendingDescriptorSummaries: vi.fn().mockResolvedValue([]),
  markReported: vi.fn().mockResolvedValue(undefined),
});
const createSession = () => new ResidentIntegritySession({
  contestId: "contest-a", nextSequence: 1,
  scope: { run_id: "33333333-3333-3333-3333-333333333333",
    participant_id: 44, device_id: "device-a", attempt_id: "44444444-4444-4444-4444-444444444444" },
  run: { id: "33333333-3333-3333-3333-333333333333", participantId: 44,
    sessionState: "active", health: "healthy", policySnapshot: {},
    registrySnapshot: { version: "test", definitions: frontendRegistryDefinitions } },
  snapshotProvider: () => ({ pageVisible: true, online: true, fullscreen: true,
    screenCapture: "disabled", webcamCapture: "disabled", activeSourceDescriptors: [] }),
  onGap: vi.fn(), onLocalLoss: vi.fn(), onProgress: vi.fn(),
});
const signal = (eventType = "exam_entered", clientOccurredAtMs = 2_000) => ({
  eventType, clientOccurredAtMs, payload: { source: "answering_screen" },
});

beforeEach(() => {
  vi.spyOn(IntegrityTransport.prototype, "start").mockImplementation(() => {});
  vi.spyOn(OpfsEvidenceStore, "open").mockResolvedValue(evidenceMock() as unknown as OpfsEvidenceStore);
});
afterEach(() => vi.restoreAllMocks());

describe("Resident integrity emitter and shared contract", () => {
  it("resolves an admitted signal only after the durable append", async () => {
    const outbox = outboxMock();
    let persisted!: () => void;
    outbox.append.mockImplementation(() => new Promise<void>(resolve => { persisted = resolve; }));
    vi.spyOn(IndexedDbIntegrityOutbox, "open").mockResolvedValue(outbox as unknown as IndexedDbIntegrityOutbox);
    const session = createSession();
    try {
      await session.start();
      let resolved = false;
      const completion = session.emitter.emit(signal()).then(() => { resolved = true; });
      await vi.waitFor(() => expect(outbox.append).toHaveBeenCalledOnce());
      expect(resolved).toBe(false);
      persisted();
      await completion;
      expect(outbox.append).toHaveBeenCalledWith(signal());
    } finally { await session.close(); }
  });

  it("preserves repeated detector events and source order without browser policy decisions", async () => {
    const outbox = outboxMock();
    vi.spyOn(IndexedDbIntegrityOutbox, "open").mockResolvedValue(outbox as unknown as IndexedDbIntegrityOutbox);
    const session = createSession();
    try {
      await session.start();
      await Promise.all([
        session.emitter.emit(signal("mouse_leave_triggered", 1_000)),
        session.emitter.emit(signal("mouse_leave_triggered", 1_001)),
      ]);
      expect(outbox.append.mock.calls.map(([event]) => event)).toEqual([
        signal("mouse_leave_triggered", 1_000), signal("mouse_leave_triggered", 1_001),
      ]);
    } finally { await session.close(); }
  });

  it("accepts a registry-only event without changing transport core", async () => {
    const outbox = outboxMock();
    vi.spyOn(IndexedDbIntegrityOutbox, "open").mockResolvedValue(outbox as unknown as IndexedDbIntegrityOutbox);
    assertFrontendSignalsInRegistry({ version: "registry-v2", definitions: {
      ...frontendRegistryDefinitions,
      head_pose: { signals: { triggered: "head_pose_changed", escalated: "", restored: "" }, emission: "sample" },
    } });
    const session = createSession();
    try {
      await session.start();
      await session.emitter.emit(signal("head_pose_changed"));
      expect(outbox.append).toHaveBeenCalledWith(signal("head_pose_changed"));
    } finally { await session.close(); }
  });

  it("persists exactly one exam entry queued during delayed IndexedDB startup", async () => {
    const outbox = outboxMock();
    let resolveOpen!: (value: IndexedDbIntegrityOutbox) => void;
    vi.spyOn(IndexedDbIntegrityOutbox, "open").mockReturnValue(new Promise(resolve => { resolveOpen = resolve; }));
    const session = createSession();
    try {
      const starting = session.start();
      const completion = session.emitter.emit(signal());
      expect(outbox.append).not.toHaveBeenCalled();
      resolveOpen(outbox as unknown as IndexedDbIntegrityOutbox);
      await Promise.all([starting, completion]);
      expect(outbox.append).toHaveBeenCalledOnce();
      expect(IntegrityTransport.prototype.start).toHaveBeenCalledOnce();
    } finally { await session.close(); }
  });

  it("keeps event delivery active when OPFS evidence storage is unavailable", async () => {
    const outbox = outboxMock();
    vi.spyOn(IndexedDbIntegrityOutbox, "open").mockResolvedValue(outbox as unknown as IndexedDbIntegrityOutbox);
    vi.mocked(OpfsEvidenceStore.open).mockRejectedValue(new Error("OPFS unavailable"));
    const session = createSession();
    try {
      await session.start();
      await session.emitter.emit(signal());
      expect(outbox.append).toHaveBeenCalledWith(signal());
      expect(IntegrityTransport.prototype.start).toHaveBeenCalledOnce();
      expect(outbox.append).toHaveBeenCalledTimes(1);
    } finally { await session.close(); }
  });

  it("starts event delivery while evidence storage is still initializing", async () => {
    const outbox = outboxMock();
    vi.spyOn(IndexedDbIntegrityOutbox, "open").mockResolvedValue(outbox as unknown as IndexedDbIntegrityOutbox);
    let resolveEvidence!: (value: OpfsEvidenceStore) => void;
    vi.mocked(OpfsEvidenceStore.open).mockReturnValue(new Promise(resolve => { resolveEvidence = resolve; }));
    const session = createSession();
    const starting = session.start();
    try {
      await vi.waitFor(() => expect(OpfsEvidenceStore.open).toHaveBeenCalledOnce());
      await vi.waitFor(() => expect(IntegrityTransport.prototype.start).toHaveBeenCalledOnce(), { timeout: 500 });
      await session.emitter.emit(signal());
      expect(outbox.append).toHaveBeenCalledWith(signal());
    } finally {
      resolveEvidence(evidenceMock() as unknown as OpfsEvidenceStore);
      await starting;
      await session.close();
    }
  });

  it("updates checkpoint health without modifying the prior health snapshot", () => {
    const before = initialHealthSnapshot();
    const after = applyIntegrityHealthUpdate(before, { component: "evidence_source",
      source: "webcam", status: "degraded", reason: "recorder_failed" });
    expect(before.evidenceSources.webcam.status).toBe("disabled");
    expect(after.evidenceSources.webcam).toEqual({ status: "degraded", reason: "recorder_failed" });
  });

  it("keeps every literal frontend emission in the declared frozen-registry contract", async () => {
    const sourceFiles = [
      ...await contestIntegritySourceFiles(),
      { path: "./useIntegrityRuntime.ts", text: integrityRuntimeSource },
    ];
    const emittedSignals = new Set<string>();
    for (const source of sourceFiles) {
      for (const match of source.text.matchAll(/(?:eventType:\s*|emit\(\s*)["']([A-Za-z][A-Za-z0-9_]*)["']/g)) {
        emittedSignals.add(match[1]);
      }
    }
    expect([...emittedSignals].sort()).toEqual([...FRONTEND_INTEGRITY_SIGNAL_IDS].sort());
  });

  it("rejects a frozen registry snapshot that misses a frontend emission", () => {
    expect(() => assertFrontendSignalsInRegistry({
      version: "test",
      definitions: {
        incomplete: { signals: { triggered: "exam_entered" } },
      },
    })).toThrow("forbidden_action");
  });

});
