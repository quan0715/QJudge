import { useEffect, useRef, useState } from "react";
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
}: CreateIntegrityRuntimeOptions): IntegrityRuntime => ({
  emit: async (signal) => {
    await outbox.append(signal);
  },
  start: () => transport?.start(),
  stop: () => transport?.stop(),
});

export interface UseIntegrityRuntimeOptions {
  enabled: boolean;
  contestId: string;
  integrityRun?: ContestIntegrityRun;
  snapshotProvider: () => ExamIntegrityStateSnapshot;
}

const inactiveEmitter: IntegritySignalEmitter = {
  emit: async () => undefined,
};

export const useIntegrityRuntime = ({
  enabled,
  contestId,
  integrityRun,
  snapshotProvider,
}: UseIntegrityRuntimeOptions): IntegritySignalEmitter => {
  const [emitter, setEmitter] = useState<IntegritySignalEmitter>(inactiveEmitter);
  const snapshotProviderRef = useRef(snapshotProvider);

  useEffect(() => {
    snapshotProviderRef.current = snapshotProvider;
  }, [snapshotProvider]);

  const runId = integrityRun?.id;
  const participantId = integrityRun?.participantId;
  const registryVersion = integrityRun?.registrySnapshot.version;

  useEffect(() => {
    if (
      !enabled ||
      !runId ||
      !participantId ||
      !registryVersion ||
      !Number.isSafeInteger(participantId)
    ) {
      setEmitter(inactiveEmitter);
      return;
    }

    let disposed = false;
    let runtime: IntegrityRuntime | null = null;
    let outbox: IndexedDbIntegrityOutbox | null = null;
    let removeSignalRelay: (() => void) | null = null;

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
        const signalRelay = (event: Event) => {
          const detail = asIntegritySignalDispatch(event);
          if (!detail) return;
          detail.completion = runtime?.emit(detail.signal) ?? Promise.resolve();
        };
        window.addEventListener(INTEGRITY_SIGNAL_EVENT, signalRelay);
        removeSignalRelay = () =>
          window.removeEventListener(INTEGRITY_SIGNAL_EVENT, signalRelay);
        setEmitter(runtime!);
      } catch {
        // A missing browser persistence capability leaves monitoring inactive;
        // it must never fall back to the retired direct event API.
        setEmitter(inactiveEmitter);
      }
    })();

    return () => {
      disposed = true;
      removeSignalRelay?.();
      runtime?.stop();
      if (outbox) void outbox.close();
      setEmitter(inactiveEmitter);
    };
  }, [contestId, enabled, integrityRun?.registrySnapshot, participantId, registryVersion, runId]);

  return emitter;
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
  ],
  { eager: true, query: "?raw", import: "default" },
);

export const contestIntegritySourceFiles = async (): Promise<IntegritySourceFile[]> =>
  Object.entries(contestIntegrityRawSources).map(([path, text]) => ({ path, text }));
