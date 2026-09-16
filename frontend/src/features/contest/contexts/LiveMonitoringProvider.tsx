import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ExamRuntimeState } from "@/core/entities/contest.entity";
import type {
  LiveSource,
  LiveState,
} from "@/core/entities/liveMonitoring.entity";
import {
  getLiveMonitoringConfig,
  requestLiveMonitoringToken,
} from "@/infrastructure/api/repositories/liveMonitoring.repository";
import {
  createLiveKitTransport,
  type LiveTransport,
} from "@/infrastructure/realtime/livekitTransport";

interface LiveMonitoringContextValue {
  setSources: (
    sources: Partial<Record<LiveSource, MediaStream | null>>,
  ) => void;
  clearSources: () => void;
  state: LiveState;
}

const LiveMonitoringContext = createContext<LiveMonitoringContextValue | null>(null);

const ACTIVE_EXAM_STATUSES = new Set(["in_progress", "paused", "locked"]);

interface LiveScope {
  runId: string;
  participantId: number;
  attemptId: string;
  deviceId: string;
}

const resolveScope = (values: {
  runId?: string;
  participantId?: number;
  attemptId?: string | null;
  deviceId?: string | null;
  activeDeviceMatches?: boolean;
  examStatus?: string;
}): LiveScope | null => {
  const {
    runId,
    participantId,
    attemptId,
    deviceId,
    activeDeviceMatches,
    examStatus,
  } = values;
  if (
    !runId ||
    typeof participantId !== "number" ||
    !Number.isSafeInteger(participantId) ||
    participantId <= 0 ||
    !attemptId ||
    !deviceId ||
    !activeDeviceMatches ||
    !ACTIVE_EXAM_STATUSES.has(examStatus ?? "")
  ) {
    return null;
  }
  return { runId, participantId, attemptId, deviceId };
};

interface LiveMonitoringProviderProps {
  contestId: string;
  runtimeState: ExamRuntimeState | null;
  children: ReactNode;
}

export function LiveMonitoringProvider({
  contestId,
  runtimeState,
  children,
}: LiveMonitoringProviderProps) {
  const [state, setState] = useState<LiveState>("idle");
  const sourcesRef = useRef<Partial<Record<LiveSource, MediaStream | null>>>({
    screen_share: null,
    webcam: null,
  });
  const [sourceRevision, setSourceRevision] = useState(0);
  const transportRef = useRef<LiveTransport | null>(null);
  const generationRef = useRef(0);

  const runId = runtimeState?.integrity_run?.id;
  const participantId = runtimeState?.participant_id;
  const attemptId = runtimeState?.session_identity.attempt_id;
  const deviceId = runtimeState?.session_identity.device_id;
  const activeDeviceMatches = runtimeState?.session_identity.active_device_matches;
  const examStatus = runtimeState?.exam_status;
  const scope = useMemo(
    () => resolveScope({
      activeDeviceMatches,
      attemptId,
      deviceId,
      examStatus,
      participantId,
      runId,
    }),
    [activeDeviceMatches, attemptId, deviceId, examStatus, participantId, runId],
  );
  const scopeKey = scope
    ? JSON.stringify([contestId, scope.runId, scope.participantId, scope.attemptId, scope.deviceId])
    : `${contestId}:inactive`;

  const setSources = useCallback(
    (sources: Partial<Record<LiveSource, MediaStream | null>>) => {
      sourcesRef.current = { ...sourcesRef.current, ...sources };
      setSourceRevision((revision) => revision + 1);
    },
    [],
  );

  const clearSources = useCallback(() => {
    sourcesRef.current = { screen_share: null, webcam: null };
    setSourceRevision((revision) => revision + 1);
  }, []);

  useEffect(() => {
    const generation = ++generationRef.current;
    const controller = new AbortController();
    let candidate: LiveTransport | null = null;
    let unsubscribe: (() => void) | null = null;

    const closeCandidate = async () => {
      unsubscribe?.();
      unsubscribe = null;
      if (transportRef.current === candidate) transportRef.current = null;
      if (candidate) await candidate.close();
    };

    if (!scope) {
      const previous = transportRef.current;
      transportRef.current = null;
      void previous?.close();
      setState("idle");
      return () => {
        controller.abort();
        generationRef.current += 1;
      };
    }

    setState("connecting");
    void (async () => {
      try {
        const config = await getLiveMonitoringConfig(contestId, controller.signal);
        if (controller.signal.aborted || generationRef.current !== generation) return;
        if (!config.enabled || !config.configured || config.provider !== "livekit") {
          setState("unavailable");
          return;
        }

        const grant = await requestLiveMonitoringToken(contestId, {
          role: "publisher",
          uploadScope: scope,
          signal: controller.signal,
        });
        if (controller.signal.aborted || generationRef.current !== generation) return;

        candidate = createLiveKitTransport();
        unsubscribe = candidate.onState((nextState) => {
          if (!controller.signal.aborted && generationRef.current === generation) {
            setState(nextState);
          }
        });
        await candidate.connect(grant);
        if (controller.signal.aborted || generationRef.current !== generation) {
          await closeCandidate();
          return;
        }
        transportRef.current = candidate;
        await candidate.publishSources(sourcesRef.current);
      } catch {
        if (controller.signal.aborted || generationRef.current !== generation) return;
        setState("unavailable");
        await closeCandidate();
      }
    })();

    return () => {
      controller.abort();
      generationRef.current += 1;
      const previous = transportRef.current;
      transportRef.current = null;
      unsubscribe?.();
      unsubscribe = null;
      void previous?.close();
      if (candidate && candidate !== previous) void candidate.close();
    };
  }, [contestId, scope, scopeKey]);

  useEffect(() => {
    const transport = transportRef.current;
    if (!transport) return;
    const generation = generationRef.current;
    void transport.publishSources(sourcesRef.current).catch(() => {
      if (generationRef.current === generation) setState("unavailable");
    });
  }, [sourceRevision]);

  const value = useMemo(
    () => ({ setSources, clearSources, state }),
    [clearSources, setSources, state],
  );
  return (
    <LiveMonitoringContext.Provider value={value}>
      {children}
    </LiveMonitoringContext.Provider>
  );
}

export const useLiveMonitoring = (): LiveMonitoringContextValue => {
  const context = useContext(LiveMonitoringContext);
  if (!context) {
    throw new Error("useLiveMonitoring must be used within a LiveMonitoringProvider");
  }
  return context;
};
