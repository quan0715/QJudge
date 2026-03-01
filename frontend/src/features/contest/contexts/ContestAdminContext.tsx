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
} from "@/infrastructure/api/repositories";
import type {
  ContestParticipant,
  ExamEvent,
} from "@/core/entities/contest.entity";

interface ContestAdminContextType {
  participants: ContestParticipant[];
  examEvents: ExamEvent[];
  isRefreshing: boolean;
  refreshAdminData: () => Promise<void>;
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
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  useEffect(() => {
    if (!autoLoad || !contestId) return;
    void refreshAdminData();
  }, [autoLoad, contestId, refreshAdminData]);

  const value = useMemo(
    () => ({
      participants,
      examEvents,
      isRefreshing,
      refreshAdminData,
    }),
    [participants, examEvents, isRefreshing, refreshAdminData]
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
