import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type {
  ContestIntegrityRun,
  IntegrityRegistrySnapshot,
} from "@/core/entities/contest.entity";
import type {
  ExamIntegrityStateSnapshot,
} from "@/core/entities/examIntegrity.entity";
import type { ExamIntegrityOutbox } from "@/core/ports/examIntegrity.port";
import { IndexedDbIntegrityOutbox } from "@/infrastructure/browser/integrity/IndexedDbIntegrityOutbox";
import { MediaRecorderChunker } from "@/infrastructure/browser/integrity/MediaRecorderChunker";
import { OpfsEvidenceStore } from "@/infrastructure/browser/integrity/OpfsEvidenceStore";
import { getDeviceId } from "@/infrastructure/api/http.client";
import { examIntegrityRepository } from "@/infrastructure/api/repositories/examIntegrity.repository";
import { IntegrityTransport } from "./IntegrityTransport";
import { EvidenceCoordinator } from "./EvidenceCoordinator";
import {
  asIntegritySignalDispatch,
  INTEGRITY_SIGNAL_EVENT,
} from "./IntegrityRuntimeContext";
import type { IntegritySignalEmitter } from "./IntegrityRuntimeContext";
import { assertFrontendSignalsInRegistry } from "./frontendIntegritySignals";

const CLIENT_BUILD = "frontend";

export interface IntegrityRuntime {
  emit: IntegritySignalEmitter["emit"];
  start: () => void;
  stop: () => void;
}

export interface CreateIntegrityRuntimeOptions {
  outbox: Pick<ExamIntegrityOutbox, "append">;
  transport?: Pick<IntegrityTransport, "start" | "stop">;
  registry?: IntegrityRegistrySnapshot;
}

/**
 * The browser runtime is deliberately only a durable signal writer. It has no
 * policy timers, dedupe, priority, or participant-state authority; the Worker
 * decides those things from the frozen registry after batch delivery.
 */
export const createIntegrityRuntime = ({
  outbox,
  transport,
  registry,
}: CreateIntegrityRuntimeOptions): IntegrityRuntime => {
  if (registry) assertFrontendSignalsInRegistry(registry);
  return {
    emit: async (signal) => {
      await outbox.append(signal);
    },
    start: () => transport?.start(),
    stop: () => transport?.stop(),
  };
};

export interface UseIntegrityRuntimeOptions {
  enabled: boolean;
  contestId: string;
  integrityRun?: ContestIntegrityRun;
  snapshotProvider: () => ExamIntegrityStateSnapshot;
  evidenceSources?: Partial<Record<"screen_share" | "webcam", MediaStream | null>>;
  onEvidenceControllerChange?: (controller: EvidenceCoordinator | null) => void;
}

const sourceTargets = (policy: Record<string, unknown> | undefined) => {
  const evidence = policy?.evidence as Record<string, unknown> | undefined;
  const source = (name: "screen" | "webcam", fallback: { width: number; height: number; fps: number; bitrate: number }) => {
    const value = evidence?.[name];
    if (!value || typeof value !== "object") return fallback;
    const configured = value as Record<string, unknown>;
    return {
      width: typeof configured.width === "number" ? configured.width : fallback.width,
      height: typeof configured.height === "number" ? configured.height : fallback.height,
      fps: typeof configured.fps === "number" ? configured.fps : fallback.fps,
      bitrate: typeof configured.bitrate === "number" ? configured.bitrate : fallback.bitrate,
    };
  };
  return {
    screen_share: source("screen", { width: 1280, height: 720, fps: 5, bitrate: 800_000 }),
    webcam: source("webcam", { width: 640, height: 480, fps: 10, bitrate: 350_000 }),
  };
};

const evidenceBufferPolicy = (policy: Record<string, unknown> | undefined) => {
  const evidence = policy?.evidence as Record<string, unknown> | undefined;
  return {
    minimumLocalBufferMs: typeof evidence?.minimum_local_buffer_ms === "number"
      ? evidence.minimum_local_buffer_ms : 60_000,
    localCapMs: typeof evidence?.local_cap_ms === "number" ? evidence.local_cap_ms : 300_000,
    localCapBytesPerSource: typeof evidence?.local_cap_bytes_per_source === "number"
      ? evidence.local_cap_bytes_per_source : 100_000_000,
  };
};

// Device classification is browser supplied. Use the frozen policy's enabled
// union so it can never narrow a source requirement without server attestation.
const enabledEvidenceSources = (policy: Record<string, unknown> | undefined): Set<"screen_share" | "webcam"> => {
  const devicePolicy = policy?.device_policy;
  if (!devicePolicy || typeof devicePolicy !== "object") return new Set();
  const enabled = new Set<"screen_share" | "webcam">();
  for (const device of Object.values(devicePolicy as Record<string, unknown>)) {
    if (!device || typeof device !== "object" || (device as Record<string, unknown>).enabled !== true) continue;
    const sources = (device as Record<string, unknown>).sources;
    if (!sources || typeof sources !== "object") continue;
    for (const source of ["screen_share", "webcam"] as const) {
      const sourcePolicy = (sources as Record<string, unknown>)[source];
      if (sourcePolicy && typeof sourcePolicy === "object" && (sourcePolicy as Record<string, unknown>).enabled === true) {
        enabled.add(source);
      }
    }
  }
  return enabled;
};

const inactiveEmitter: IntegritySignalEmitter = {
  emit: async () => undefined,
};

interface QueuedSignal {
  signal: Parameters<IntegritySignalEmitter["emit"]>[0];
  resolve: () => void;
  reject: (reason: unknown) => void;
}

export interface QueuedIntegritySignalEmitter {
  emitter: IntegritySignalEmitter;
  activate: (runtime: IntegrityRuntime) => void;
  pause: () => void;
  fail: (reason: unknown) => void;
}

/**
 * Signals may fire from child effects before IndexedDB has opened. Preserve
 * their source ordering and resolve callers only after the durable append.
 */
export const createQueuedIntegritySignalEmitter = (): QueuedIntegritySignalEmitter => {
  const pending: QueuedSignal[] = [];
  let runtime: IntegrityRuntime | null = null;
  let draining = false;
  let failure: unknown = null;

  const drain = async (): Promise<void> => {
    if (draining || !runtime) return;
    draining = true;
    try {
      while (runtime && pending.length > 0) {
        const next = pending.shift()!;
        try {
          await runtime.emit(next.signal);
          next.resolve();
        } catch (error) {
          next.reject(error);
        }
      }
    } finally {
      draining = false;
      if (runtime && pending.length > 0) void drain();
    }
  };

  return {
    emitter: {
      emit: (signal) => new Promise<void>((resolve, reject) => {
        if (failure) {
          reject(failure);
          return;
        }
        pending.push({ signal, resolve, reject });
        void drain();
      }),
    },
    activate: (nextRuntime) => {
      if (failure) return;
      runtime = nextRuntime;
      void drain();
    },
    pause: () => {
      runtime = null;
    },
    fail: (reason) => {
      failure = reason;
      runtime = null;
      while (pending.length > 0) pending.shift()!.reject(reason);
    },
  };
};

export const useIntegrityRuntime = ({
  enabled,
  contestId,
  integrityRun,
  snapshotProvider,
  evidenceSources,
  onEvidenceControllerChange,
}: UseIntegrityRuntimeOptions): IntegritySignalEmitter => {
  const snapshotProviderRef = useRef(snapshotProvider);

  useEffect(() => {
    snapshotProviderRef.current = snapshotProvider;
  }, [snapshotProvider]);

  const runId = integrityRun?.id;
  const participantId = integrityRun?.participantId;
  const registryVersion = integrityRun?.registrySnapshot.version;
  const runtimeEnabled =
    enabled &&
    !!runId &&
    !!participantId &&
    !!registryVersion &&
    Number.isSafeInteger(participantId);
  const queuedEmitter = useMemo(
    () => createQueuedIntegritySignalEmitter(),
    [contestId, enabled, participantId, registryVersion, runId],
  );

  useLayoutEffect(() => {
    if (!runtimeEnabled || typeof window === "undefined") return;
    const signalRelay = (event: Event) => {
      const detail = asIntegritySignalDispatch(event);
      if (!detail) return;
      detail.completion = queuedEmitter.emitter.emit(detail.signal);
    };
    window.addEventListener(INTEGRITY_SIGNAL_EVENT, signalRelay);
    return () => window.removeEventListener(INTEGRITY_SIGNAL_EVENT, signalRelay);
  }, [queuedEmitter, runtimeEnabled]);

  useEffect(() => {
    if (!runtimeEnabled || !runId || !participantId || !registryVersion) return;

    let disposed = false;
    let runtime: IntegrityRuntime | null = null;
    let outbox: IndexedDbIntegrityOutbox | null = null;
    let evidenceStore: OpfsEvidenceStore | null = null;
    const chunkers: MediaRecorderChunker[] = [];

    void (async () => {
      try {
        outbox = await IndexedDbIntegrityOutbox.open({
          runId,
          participantId,
          deviceId: getDeviceId(),
          registryVersion,
          clientBuild: CLIENT_BUILD,
        });
        if (disposed) {
          await outbox.close();
          return;
        }
        evidenceStore = await OpfsEvidenceStore.open({ runId, deviceId: getDeviceId() });
        if (disposed) {
          await evidenceStore.close();
          await outbox.close();
          return;
        }
        const coordinator = new EvidenceCoordinator({
          contestId,
          runId,
          store: evidenceStore,
          repository: examIntegrityRepository,
        });
        await coordinator.start();
        const transport = new IntegrityTransport({
          contestId,
          outbox,
          repository: examIntegrityRepository,
          snapshotProvider: () => snapshotProviderRef.current(),
          evidenceDescriptorsProvider: () => coordinator.pendingDescriptorSummaries(),
          onSnapshotPersisted: (descriptors, sequence) =>
            coordinator.markSnapshotPersisted(descriptors, sequence),
          onPendingCommand: (command) => coordinator.retain(command),
          onReleaseEvidenceBeforeMs: (releaseBeforeMs) => coordinator.releaseBefore(releaseBeforeMs),
          eventTarget: typeof window === "undefined" ? undefined : window,
        });
        runtime = createIntegrityRuntime({
          outbox,
          transport,
          registry: integrityRun?.registrySnapshot,
        });
        runtime.start();
        const targets = sourceTargets(integrityRun?.policySnapshot);
        const bufferPolicy = evidenceBufferPolicy(integrityRun?.policySnapshot);
        const enabledSources = enabledEvidenceSources(integrityRun?.policySnapshot);
        const epochId = crypto.randomUUID();
        for (const source of ["screen_share", "webcam"] as const) {
          const stream = evidenceSources?.[source];
          if (!enabledSources.has(source)) continue;
          if (!stream) {
            await runtime.emit({
              eventType: "evidence_source_degraded",
              clientOccurredAtMs: Date.now(),
              payload: { source, reason: "stream_unavailable" },
            });
            continue;
          }
          if (!stream.active || stream.getVideoTracks().length === 0) {
            await runtime.emit({
              eventType: "evidence_source_degraded",
              clientOccurredAtMs: Date.now(),
              payload: { source, reason: "stream_ended" },
            });
            continue;
          }
          let chunker: MediaRecorderChunker;
          chunker = new MediaRecorderChunker({
            source,
            stream,
            epochId,
            store: evidenceStore,
            target: targets[source],
            onDegraded: async (reason) => {
              await runtime?.emit({
                eventType: "evidence_source_degraded",
                clientOccurredAtMs: Date.now(),
                payload: { source, reason },
              });
            },
            onStoredChunk: async () => {
              if (await coordinator.enforceCapacity(source, bufferPolicy)) return;
              chunker.stop();
              await runtime?.emit({
                eventType: "evidence_buffer_degraded",
                clientOccurredAtMs: Date.now(),
                payload: {
                  source,
                  reason: "capacity_protected_evidence",
                  local_cap_bytes: bufferPolicy.localCapBytesPerSource,
                  local_cap_ms: bufferPolicy.localCapMs,
                },
              });
            },
          });
          chunkers.push(chunker);
          chunker.start();
        }
        onEvidenceControllerChange?.(coordinator);
        queuedEmitter.activate(runtime);
      } catch (error) {
        // A missing browser persistence capability leaves monitoring inactive;
        // it must never fall back to the retired direct event API.
        if (!disposed) queuedEmitter.fail(error);
        if (evidenceStore) void evidenceStore.close();
        if (outbox) void outbox.close();
      }
    })();

    return () => {
      disposed = true;
      queuedEmitter.pause();
      onEvidenceControllerChange?.(null);
      chunkers.forEach((chunker) => chunker.stop());
      runtime?.stop();
      if (evidenceStore) void evidenceStore.close();
      if (outbox) void outbox.close();
    };
  }, [
    contestId,
    evidenceSources?.screen_share,
    evidenceSources?.webcam,
    integrityRun?.policySnapshot,
    integrityRun?.registrySnapshot,
    onEvidenceControllerChange,
    participantId,
    queuedEmitter,
    registryVersion,
    runId,
    runtimeEnabled,
  ]);

  return runtimeEnabled ? queuedEmitter.emitter : inactiveEmitter;
};

type IntegritySourceFile = { path: string; text: string };

const contestIntegrityRawSources = import.meta.glob<string>(
  [
    "../../components/ExamModeWrapper.tsx",
    "../../hooks/useExamMonitoring.ts",
    "../../hooks/useFullscreenMonitoring.ts",
    "../../hooks/useMouseLeaveMonitoring.ts",
    "../../hooks/useMultiDisplayMonitoring.ts",
    "../../hooks/useScreenShareMonitoring.ts",
    "../../hooks/useViewportMonitoring.ts",
    "../../hooks/useWebcamMonitoring.ts",
    "../../hooks/useExamState.ts",
    "../../hooks/useContestExamActions.ts",
    "../../screens/paperExam/usePaperExamFlow.ts",
    "../../screens/paperExam/PaperExamAnsweringScreen.tsx",
    "../../screens/paperExam/hooks/useAnticheatScreenCapture.ts",
    "../../screens/paperExam/hooks/useAnticheatWebcamCapture.ts",
    "../../detectors/clipboardDetector.ts",
    "../../detectors/keyboardShortcutDetector.ts",
    "../../detectors/popupGuardDetector.ts",
    "./IntegrityTransport.ts",
  ],
  { eager: true, query: "?raw", import: "default" },
);

export const contestIntegritySourceFiles = async (): Promise<IntegritySourceFile[]> =>
  Object.entries(contestIntegrityRawSources).map(([path, text]) => ({ path, text }));
