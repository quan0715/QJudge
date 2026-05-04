import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import {
  getContestParticipants,
  getExamEvents,
  getContestActivities,
  getContestOverviewMetrics,
} from "@/infrastructure/api/repositories";
import type {
  ContestParticipant,
  ContestOverviewMetrics,
  ExamEvent,
} from "@/core/entities/contest.entity";

interface ContestAdminContextType {
  participants: ContestParticipant[];
  examEvents: ExamEvent[];
  overviewMetrics: ContestOverviewMetrics | null;
  /** True only during the first automatic load; false once data has arrived at least once. */
  initialLoading: boolean;
  examEventsLoading: boolean;
  isRefreshing: boolean;
  isOverviewRefreshing: boolean;
  refreshParticipants: () => Promise<void>;
  refreshExamEvents: () => Promise<void>;
  refreshAdminData: () => Promise<void>;
  refreshOverviewMetrics: () => Promise<void>;
  refreshAllAdminData: () => Promise<void>;
}

const ContestAdminContext = createContext<ContestAdminContextType | undefined>(
  undefined
);

/**
 * Skip state updates when polling returns a list that's structurally
 * identical to what we already hold. We compare the volatile fields the UI
 * actually reads so background polls don't trigger noisy re-renders.
 */
const sameLiveMonitoringSources = (
  a?: ContestParticipant["liveMonitoringSources"],
  b?: ContestParticipant["liveMonitoringSources"],
): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const sameParticipantSnapshot = (
  prev: ContestParticipant[],
  next: ContestParticipant[],
): boolean => {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    const a = prev[i];
    const b = next[i];
    if (
      a.userId !== b.userId ||
      a.examStatus !== b.examStatus ||
      a.connectionStatus !== b.connectionStatus ||
      a.liveMonitoringOnline !== b.liveMonitoringOnline ||
      a.score !== b.score ||
      a.violationCount !== b.violationCount ||
      a.lockReason !== b.lockReason ||
      a.submitReason !== b.submitReason ||
      !sameLiveMonitoringSources(a.liveMonitoringSources, b.liveMonitoringSources)
    ) {
      return false;
    }
  }
  return true;
};

interface ContestAdminProviderProps {
  children: ReactNode;
  contestId?: string;
  autoLoad?: boolean;
}

export const ContestAdminProvider: React.FC<ContestAdminProviderProps> = ({
  children,
  contestId: propContestId,
  autoLoad = true,
}) => {
  const params = useParams<{ contestId: string }>();
  const contestId = propContestId || params.contestId;

  const [participants, setParticipants] = useState<ContestParticipant[]>([]);
  const [examEvents, setExamEvents] = useState<ExamEvent[]>([]);
  const [overviewMetrics, setOverviewMetrics] =
    useState<ContestOverviewMetrics | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [examEventsLoading, setExamEventsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOverviewRefreshing, setIsOverviewRefreshing] = useState(false);

  const refreshParticipants = useCallback(async () => {
    if (!contestId) return;

    try {
      const participantsData = await getContestParticipants(contestId);
      setParticipants((prev) =>
        sameParticipantSnapshot(prev, participantsData) ? prev : participantsData,
      );
    } catch (err) {
      console.error("Failed to fetch contest participants:", err);
    }
  }, [contestId]);

  const refreshExamEvents = useCallback(async () => {
    if (!contestId) return;

    setExamEventsLoading(true);
    try {
      const [examEventsData, activitiesData] = await Promise.all([
        getExamEvents(contestId),
        getContestActivities(contestId),
      ]);
      const allEvents = [...examEventsData, ...activitiesData].sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      setExamEvents(allEvents);
    } catch (err) {
      console.error("Failed to fetch contest exam events:", err);
    } finally {
      setExamEventsLoading(false);
    }
  }, [contestId]);

  const refreshAdminData = useCallback(async () => {
    if (!contestId) return;

    setIsRefreshing(true);
    try {
      // Fire participants and events in parallel; each updates its slice as
      // soon as its own request resolves so slow event payloads don't block
      // the participant grid.
      await Promise.all([refreshParticipants(), refreshExamEvents()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [contestId, refreshExamEvents, refreshParticipants]);

  const refreshOverviewMetrics = useCallback(async () => {
    if (!contestId) return;

    setIsOverviewRefreshing(true);
    try {
      const overviewData = await getContestOverviewMetrics(contestId);
      setOverviewMetrics(overviewData);
    } catch (err) {
      console.error("Failed to fetch contest overview metrics:", err);
    } finally {
      setIsOverviewRefreshing(false);
    }
  }, [contestId]);

  const refreshAllAdminData = useCallback(async () => {
    await Promise.all([refreshAdminData(), refreshOverviewMetrics()]);
  }, [refreshAdminData, refreshOverviewMetrics]);

  useEffect(() => {
    if (!autoLoad || !contestId) return;
    // Resolve initialLoading on the participants slice; events slice tracks
    // its own loading via examEventsLoading so the participant grid can
    // render immediately while the heavier events payload arrives later.
    void Promise.all([refreshParticipants(), refreshOverviewMetrics()]).finally(
      () => setInitialLoading(false),
    );
    void refreshExamEvents();
  }, [
    autoLoad,
    contestId,
    refreshExamEvents,
    refreshOverviewMetrics,
    refreshParticipants,
  ]);

  const value = useMemo(
    () => ({
      participants,
      examEvents,
      overviewMetrics,
      initialLoading,
      examEventsLoading,
      isRefreshing,
      isOverviewRefreshing,
      refreshParticipants,
      refreshExamEvents,
      refreshAdminData,
      refreshOverviewMetrics,
      refreshAllAdminData,
    }),
    [
      participants,
      examEvents,
      overviewMetrics,
      initialLoading,
      examEventsLoading,
      isRefreshing,
      isOverviewRefreshing,
      refreshParticipants,
      refreshExamEvents,
      refreshAdminData,
      refreshOverviewMetrics,
      refreshAllAdminData,
    ]
  );

  return (
    <ContestAdminContext.Provider value={value}>
      {children}
    </ContestAdminContext.Provider>
  );
};

export const useContestAdmin = (): ContestAdminContextType => {
  const context = useContext(ContestAdminContext);
  if (context === undefined) {
    throw new Error(
      "useContestAdmin must be used within a ContestAdminProvider"
    );
  }
  return context;
};

export default ContestAdminContext;
