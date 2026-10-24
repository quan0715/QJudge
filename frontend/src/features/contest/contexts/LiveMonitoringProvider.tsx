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
import type { LiveTransport } from "@/infrastructure/realtime/livekitTransport";
import { useLiveMonitoringConnection } from "../hooks/useLiveMonitoringConnection";

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
  const sourcesRef = useRef<Partial<Record<LiveSource, MediaStream | null>>>({
    screen_share: null,
    webcam: null,
  });
  const [sourceRevision, setSourceRevision] = useState(0);

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

  const publishCurrentSources = useCallback((transport: LiveTransport) =>
    transport.publishSources(sourcesRef.current), []);
  const { transportRef, state, reconnect } = useLiveMonitoringConnection({
    contestId, enabled: !!scope, role: "publisher", uploadScope: scope ?? undefined,
    onConnected: publishCurrentSources,
  });

  useEffect(() => {
    const transport = transportRef.current;
    if (!transport) return;
    void transport.publishSources(sourcesRef.current).catch(() => {
      if (transportRef.current === transport) reconnect();
    });
  }, [sourceRevision, transportRef, reconnect]);

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
