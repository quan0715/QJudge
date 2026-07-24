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
import { getDeviceId } from "@/infrastructure/api/http.client";
import { examIntegrityRepository } from "@/infrastructure/api/repositories/examIntegrity.repository";
import { IntegrityTransport } from "./IntegrityTransport";
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
}

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
        const transport = new IntegrityTransport({
          contestId,
          outbox,
          repository: examIntegrityRepository,
          snapshotProvider: () => snapshotProviderRef.current(),
          eventTarget: typeof window === "undefined" ? undefined : window,
        });
        runtime = createIntegrityRuntime({
          outbox,
          transport,
          registry: integrityRun?.registrySnapshot,
        });
        runtime.start();
        queuedEmitter.activate(runtime);
      } catch (error) {
        // A missing browser persistence capability leaves monitoring inactive;
        // it must never fall back to the retired direct event API.
        if (!disposed) queuedEmitter.fail(error);
        if (outbox) void outbox.close();
      }
    })();

    return () => {
      disposed = true;
      queuedEmitter.pause();
      runtime?.stop();
      if (outbox) void outbox.close();
    };
  }, [contestId, integrityRun?.registrySnapshot, participantId, queuedEmitter, registryVersion, runId, runtimeEnabled]);

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
    "../../detectors/clipboardDetector.ts",
    "../../detectors/keyboardShortcutDetector.ts",
    "../../detectors/popupGuardDetector.ts",
    "./IntegrityTransport.ts",
  ],
  { eager: true, query: "?raw", import: "default" },
);

export const contestIntegritySourceFiles = async (): Promise<IntegritySourceFile[]> =>
  Object.entries(contestIntegrityRawSources).map(([path, text]) => ({ path, text }));
