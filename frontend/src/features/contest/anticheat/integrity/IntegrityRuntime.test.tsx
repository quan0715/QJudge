import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ExamIntegrityOutbox } from "@/core/ports/examIntegrity.repository";
import { IndexedDbIntegrityOutbox } from "@/infrastructure/browser/integrity/indexedDbIntegrityOutbox";
import { OpfsEvidenceStore } from "@/infrastructure/browser/integrity/opfsEvidenceStore";
import {
  contestIntegritySourceFiles,
  createIntegrityRuntime,
  createQueuedIntegritySignalEmitter,
  useIntegrityRuntime,
} from "./useIntegrityRuntime";
import { IntegrityTransport } from "./integrityTransport";
import integrityRuntimeSource from "./useIntegrityRuntime.ts?raw";
import {
  assertFrontendSignalsInRegistry,
  FRONTEND_INTEGRITY_SIGNAL_IDS,
} from "./frontendIntegritySignals";

const createOutboxMock = (): Pick<ExamIntegrityOutbox, "append"> => ({
  append: vi.fn().mockResolvedValue({}),
});

const frontendRegistryDefinitions = Object.fromEntries(
  FRONTEND_INTEGRITY_SIGNAL_IDS.map((signal) => [
    signal,
    { signals: { triggered: signal, escalated: "", restored: "" } },
  ]),
);

describe("IntegrityRuntime", () => {
  it("persists a detector signal before resolving emit", async () => {
    const outbox = createOutboxMock();
    const runtime = createIntegrityRuntime({ outbox });

    await runtime.emit({
      eventType: "exit_fullscreen_triggered",
      clientOccurredAtMs: 1_000,
      payload: { fullscreen: false },
    });

    expect(outbox.append).toHaveBeenCalledWith({
      eventType: "exit_fullscreen_triggered",
      clientOccurredAtMs: 1_000,
      payload: { fullscreen: false },
    });
  });

  it("does not add timers, dedupe, priority, grace, or actions in detector runtime", async () => {
    const outbox = createOutboxMock();
    const runtime = createIntegrityRuntime({ outbox });

    await runtime.emit({
      eventType: "mouse_leave_triggered",
      clientOccurredAtMs: 1_000,
      payload: {},
    });
    await runtime.emit({
      eventType: "mouse_leave_triggered",
      clientOccurredAtMs: 1_001,
      payload: {},
    });

    expect(outbox.append).toHaveBeenCalledTimes(2);
  });

  it("accepts a registry-only event without changing transport core", async () => {
    const outbox = createOutboxMock();
    const runtime = createIntegrityRuntime({
      outbox,
      registry: {
        version: "registry-v2",
        definitions: {
          ...frontendRegistryDefinitions,
          head_pose: {
            signals: {
              triggered: "head_pose_changed",
              escalated: "",
              restored: "",
            },
            emission: "sample",
          },
        },
      },
    });

    await runtime.emit({
      eventType: "head_pose_changed",
      clientOccurredAtMs: 2_000,
      payload: {},
    });

    expect(outbox.append).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "head_pose_changed" }),
    );
  });

  it("queues an exam entry until delayed runtime startup then persists it once", async () => {
    const outbox = createOutboxMock();
    const queued = createQueuedIntegritySignalEmitter();
    const completion = queued.emitter.emit({
      eventType: "exam_entered",
      clientOccurredAtMs: 2_000,
      payload: { source: "answering_screen" },
    });

    expect(outbox.append).not.toHaveBeenCalled();
    queued.activate(createIntegrityRuntime({ outbox }));
    await completion;

    expect(outbox.append).toHaveBeenCalledTimes(1);
    expect(outbox.append).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "exam_entered",
      clientOccurredAtMs: 2_000,
    }));
  });

  it("updates checkpoint health without appending a semantic event", () => {
    const onHealthUpdate = vi.fn();
    const queued = createQueuedIntegritySignalEmitter(onHealthUpdate);

    queued.emitter.updateHealth?.({
      component: "evidence_source",
      source: "webcam",
      status: "degraded",
      reason: "recorder_failed",
    });

    expect(onHealthUpdate).toHaveBeenCalledWith({
      component: "evidence_source",
      source: "webcam",
      status: "degraded",
      reason: "recorder_failed",
    });
  });

  it("persists exactly one exam entry after a delayed IndexedDB open", async () => {
    let resolveOpen!: (outbox: IndexedDbIntegrityOutbox) => void;
    const open = new Promise<IndexedDbIntegrityOutbox>((resolve) => {
      resolveOpen = resolve;
    });
    const outbox = {
      append: vi.fn().mockResolvedValue({}),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as IndexedDbIntegrityOutbox;
    const openSpy = vi.spyOn(IndexedDbIntegrityOutbox, "open").mockReturnValue(open);
    const evidenceStore = {
      close: vi.fn().mockResolvedValue(undefined),
      pendingDescriptorSummaries: vi.fn().mockResolvedValue([]),
      markReported: vi.fn().mockResolvedValue(undefined),
      listDescriptors: vi.fn().mockResolvedValue([]),
      getBlob: vi.fn(),
      protect: vi.fn(),
      releaseProtection: vi.fn(),
      markRequested: vi.fn(),
      markVerified: vi.fn(),
      markUnavailable: vi.fn(),
      deleteDescriptor: vi.fn(),
      reconcile: vi.fn().mockResolvedValue(undefined),
    } as unknown as OpfsEvidenceStore;
    const evidenceOpenSpy = vi.spyOn(OpfsEvidenceStore, "open").mockResolvedValue(evidenceStore);
    const transportStartSpy = vi.spyOn(IntegrityTransport.prototype, "start").mockImplementation(() => {});
    const transportStopSpy = vi.spyOn(IntegrityTransport.prototype, "stop").mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useIntegrityRuntime({
      enabled: true,
      contestId: "contest-a",
      integrityRun: {
        id: "33333333-3333-3333-3333-333333333333",
        computeState: "running",
        health: "healthy",
        participantId: 44,
        policySnapshot: {},
        registrySnapshot: {
          version: "test",
          definitions: frontendRegistryDefinitions,
        },
      },
      snapshotProvider: () => ({
        pageVisible: true,
        online: true,
        fullscreen: true,
        screenCapture: "active",
        webcamCapture: "disabled",
        activeSourceDescriptors: [],
      }),
    }));
    const completion = result.current.emit({
      eventType: "exam_entered",
      clientOccurredAtMs: 2_000,
      payload: { source: "answering_screen" },
    });

    expect(outbox.append).not.toHaveBeenCalled();
    await act(async () => {
      resolveOpen(outbox);
      await completion;
    });

    expect(outbox.append).toHaveBeenCalledTimes(1);
    expect(transportStartSpy).toHaveBeenCalledTimes(1);
    unmount();
    expect(transportStopSpy).toHaveBeenCalledTimes(1);
    openSpy.mockRestore();
    evidenceOpenSpy.mockRestore();
    transportStartSpy.mockRestore();
    transportStopSpy.mockRestore();
  });

  it("keeps event delivery active when OPFS evidence storage is unavailable", async () => {
    const outbox = {
      append: vi.fn().mockResolvedValue({}),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as IndexedDbIntegrityOutbox;
    const openSpy = vi.spyOn(IndexedDbIntegrityOutbox, "open").mockResolvedValue(outbox);
    const evidenceOpenSpy = vi.spyOn(OpfsEvidenceStore, "open").mockRejectedValue(
      new Error("OPFS is unavailable for integrity evidence"),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const transportStartSpy = vi.spyOn(IntegrityTransport.prototype, "start").mockImplementation(() => {});
    const transportStopSpy = vi.spyOn(IntegrityTransport.prototype, "stop").mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useIntegrityRuntime({
      enabled: true,
      contestId: "contest-a",
      integrityRun: {
        id: "33333333-3333-3333-3333-333333333333",
        computeState: "running",
        health: "healthy",
        participantId: 44,
        policySnapshot: {},
        registrySnapshot: {
          version: "test",
          definitions: frontendRegistryDefinitions,
        },
      },
      snapshotProvider: () => ({
        pageVisible: true,
        online: true,
        fullscreen: true,
        screenCapture: "active",
        webcamCapture: "disabled",
        activeSourceDescriptors: [],
      }),
    }));

    await result.current.emit({
      eventType: "exam_entered",
      clientOccurredAtMs: 2_000,
      payload: { source: "answering_screen" },
    });

    expect(outbox.append).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "exam_entered",
    }));
    expect(transportStartSpy).toHaveBeenCalledTimes(1);

    unmount();
    openSpy.mockRestore();
    evidenceOpenSpy.mockRestore();
    warnSpy.mockRestore();
    transportStartSpy.mockRestore();
    transportStopSpy.mockRestore();
  });

  it("starts event delivery while evidence storage is still initializing", async () => {
    let resolveEvidenceStore!: (store: OpfsEvidenceStore) => void;
    const evidenceStoreOpen = new Promise<OpfsEvidenceStore>((resolve) => {
      resolveEvidenceStore = resolve;
    });
    const outbox = {
      append: vi.fn().mockResolvedValue({}),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as IndexedDbIntegrityOutbox;
    const evidenceStore = {
      close: vi.fn().mockResolvedValue(undefined),
      reconcile: vi.fn().mockResolvedValue(undefined),
      pendingDescriptorSummaries: vi.fn().mockResolvedValue([]),
      markReported: vi.fn().mockResolvedValue(undefined),
      listDescriptors: vi.fn().mockResolvedValue([]),
      getBlob: vi.fn(), protect: vi.fn(), releaseProtection: vi.fn(),
      markRequested: vi.fn(), markVerified: vi.fn(), markUnavailable: vi.fn(),
      deleteDescriptor: vi.fn(),
    } as unknown as OpfsEvidenceStore;
    const openSpy = vi.spyOn(IndexedDbIntegrityOutbox, "open").mockResolvedValue(outbox);
    const evidenceOpenSpy = vi.spyOn(OpfsEvidenceStore, "open").mockReturnValue(evidenceStoreOpen);
    const transportStartSpy = vi.spyOn(IntegrityTransport.prototype, "start").mockImplementation(() => {});
    const transportStopSpy = vi.spyOn(IntegrityTransport.prototype, "stop").mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useIntegrityRuntime({
      enabled: true,
      contestId: "contest-a",
      integrityRun: {
        id: "33333333-3333-3333-3333-333333333333",
        computeState: "running",
        health: "healthy",
        participantId: 44,
        policySnapshot: {},
        registrySnapshot: { version: "test", definitions: frontendRegistryDefinitions },
      },
      snapshotProvider: () => ({
        pageVisible: true, online: true, fullscreen: true,
        screenCapture: "active", webcamCapture: "disabled", activeSourceDescriptors: [],
      }),
    }));

    await waitFor(() => expect(evidenceOpenSpy).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(transportStartSpy).toHaveBeenCalledTimes(1));

    const completion = result.current.emit({
      eventType: "exam_entered",
      clientOccurredAtMs: 2_000,
      payload: { source: "answering_screen" },
    });
    await completion;
    expect(outbox.append).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "exam_entered",
    }));

    // Let the background evidence initializer settle before unmount cleanup.
    await act(async () => { resolveEvidenceStore(evidenceStore); });

    unmount();
    openSpy.mockRestore();
    evidenceOpenSpy.mockRestore();
    transportStartSpy.mockRestore();
    transportStopSpy.mockRestore();
  });

  it("does not record missing evidence infrastructure as a semantic event", async () => {
    const outbox = {
      append: vi.fn().mockResolvedValue({}),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as IndexedDbIntegrityOutbox;
    const evidenceStore = {
      close: vi.fn().mockResolvedValue(undefined),
      reconcile: vi.fn().mockResolvedValue(undefined),
      pendingDescriptorSummaries: vi.fn().mockResolvedValue([]),
      markReported: vi.fn().mockResolvedValue(undefined),
      listDescriptors: vi.fn().mockResolvedValue([]),
      getBlob: vi.fn(),
      protect: vi.fn(),
      releaseProtection: vi.fn(),
      markRequested: vi.fn(),
      markVerified: vi.fn(),
      markUnavailable: vi.fn(),
      deleteDescriptor: vi.fn(),
    } as unknown as OpfsEvidenceStore;
    const openSpy = vi.spyOn(IndexedDbIntegrityOutbox, "open").mockResolvedValue(outbox);
    const evidenceOpenSpy = vi.spyOn(OpfsEvidenceStore, "open").mockResolvedValue(evidenceStore);
    const transportStartSpy = vi.spyOn(IntegrityTransport.prototype, "start").mockImplementation(() => {});
    const transportStopSpy = vi.spyOn(IntegrityTransport.prototype, "stop").mockImplementation(() => {});
    const { unmount } = renderHook(() => useIntegrityRuntime({
      enabled: true,
      contestId: "contest-a",
      integrityRun: {
        id: "33333333-3333-3333-3333-333333333333",
        computeState: "running",
        health: "healthy",
        participantId: 44,
        policySnapshot: {
          device_policy: {
            required_webcam: {
              enabled: true,
              sources: { webcam: { enabled: true } },
            },
          },
        },
        registrySnapshot: {
          version: "test",
          definitions: frontendRegistryDefinitions,
        },
      },
      snapshotProvider: () => ({
        pageVisible: true,
        online: true,
        fullscreen: true,
        screenCapture: "disabled",
        webcamCapture: "unavailable",
        activeSourceDescriptors: [],
      }),
    }));

    await waitFor(() => expect(evidenceOpenSpy).toHaveBeenCalledTimes(1));
    unmount();
    expect(transportStartSpy).toHaveBeenCalledTimes(1);
    expect(transportStopSpy).toHaveBeenCalledTimes(1);
    openSpy.mockRestore();
    evidenceOpenSpy.mockRestore();
    transportStartSpy.mockRestore();
    transportStopSpy.mockRestore();
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
