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
  isRefreshing: boolean;
  isOverviewRefreshing: boolean;
  refreshAdminData: () => Promise<void>;
  refreshOverviewMetrics: () => Promise<void>;
  refreshAllAdminData: () => Promise<void>;
}

const ContestAdminContext = createContext<ContestAdminContextType | undefined>(
  undefined
);

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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOverviewRefreshing, setIsOverviewRefreshing] = useState(false);

  const refreshAdminData = useCallback(async () => {
    if (!contestId) return;

    setIsRefreshing(true);
    try {
      const [participantsData, examEventsData, activitiesData] =
        await Promise.all([
          getContestParticipants(contestId),
          getExamEvents(contestId),
          getContestActivities(contestId),
        ]);

      setParticipants(participantsData);

      // Merge exam events and activities, newest first.
      const allEvents = [...examEventsData, ...activitiesData].sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setExamEvents(allEvents);
    } catch (err) {
      console.error("Failed to fetch admin contest data:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [contestId]);

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
    void refreshAllAdminData();
  }, [autoLoad, contestId, refreshAllAdminData]);

  useEffect(() => {
    if (!autoLoad || !contestId) return;

    const intervalId = window.setInterval(() => {
      void refreshOverviewMetrics();
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [autoLoad, contestId, refreshOverviewMetrics]);

  const value = useMemo(
    () => ({
      participants,
      examEvents,
      overviewMetrics,
      isRefreshing,
      isOverviewRefreshing,
      refreshAdminData,
      refreshOverviewMetrics,
      refreshAllAdminData,
    }),
    [
      participants,
      examEvents,
      overviewMetrics,
      isRefreshing,
      isOverviewRefreshing,
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
