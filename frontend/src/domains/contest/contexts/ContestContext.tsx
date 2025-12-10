import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import {
  getContest,
  getContestStandings,
  getContestParticipants,
  getExamEvents,
} from "@/services/contest";
import type {
  ContestDetail,
  ScoreboardData,
  ContestParticipant,
  ExamEvent,
} from "@/core/entities/contest.entity";

interface ContestContextType {
  // Core contest data
  contest: ContestDetail | null;
  loading: boolean;
  error: string | null;

  // Standings data (for all users)
  // ScoreboardData contains problems + rows as returned by API
  scoreboardData: ScoreboardData | null;
  standingsLoading: boolean;

  // Admin-only data
  participants: ContestParticipant[];
  examEvents: ExamEvent[];

  // Refresh state (for button animation, not blocking)
  isRefreshing: boolean;

  // Granular refresh functions
  refreshContest: () => Promise<void>;
  refreshStandings: () => Promise<void>;
  refreshAdminData: () => Promise<void>; // participants + events
  refreshAll: () => Promise<void>;
}

const ContestContext = createContext<ContestContextType | undefined>(undefined);

interface ContestProviderProps {
  children: ReactNode;
  contestId?: string;
  /** Optional: provide initial contest data to avoid duplicate fetch */
  initialContest?: ContestDetail | null;
  /** Optional: external refresh function from parent */
  onRefresh?: () => Promise<void>;
}

export const ContestProvider: React.FC<ContestProviderProps> = ({
  children,
  contestId: propContestId,
  initialContest,
  onRefresh,
}) => {
  const params = useParams<{ contestId: string }>();
  const contestId = propContestId || params.contestId;

  // Core state
  const [contest, setContest] = useState<ContestDetail | null>(
    initialContest || null
  );
  const [loading, setLoading] = useState(!initialContest);
  const [error, setError] = useState<string | null>(null);

  // Standings state - store the whole ScoreboardData
  const [scoreboardData, setScoreboardData] = useState<ScoreboardData | null>(
    null
  );
  const [standingsLoading, setStandingsLoading] = useState(true);

  // Admin data state
  const [participants, setParticipants] = useState<ContestParticipant[]>([]);
  const [examEvents, setExamEvents] = useState<ExamEvent[]>([]);

  // Refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Check if current user is admin/teacher
  const isAdmin = useMemo(() => {
    return contest?.permissions?.canEditContest === true;
  }, [contest?.permissions?.canEditContest]);

  // Fetch contest details
  const fetchContest = useCallback(async () => {
    if (!contestId) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const data = await getContest(contestId);
      setContest(data || null);
    } catch (err: any) {
      setError(err.message || "Failed to load contest");
      setContest(null);
    }
  }, [contestId]);

  // Fetch standings (for all users)
  const fetchStandings = useCallback(
    async (showLoading = true) => {
      if (!contestId) return;

      if (showLoading) {
        setStandingsLoading(true);
      }
      try {
        const data = await getContestStandings(contestId);
        setScoreboardData(data);
      } catch (err) {
        console.error("Failed to fetch standings:", err);
      } finally {
        setStandingsLoading(false);
      }
    },
    [contestId]
  );

  // Fetch admin data (participants + events) - only for admins
  const fetchAdminData = useCallback(async () => {
    if (!contestId || !isAdmin) return;

    try {
      const [participantsData, eventsData] = await Promise.all([
        getContestParticipants(contestId),
        getExamEvents(contestId),
      ]);
      setParticipants(participantsData);
      setExamEvents(eventsData);
    } catch (err) {
      console.error("Failed to fetch admin data:", err);
    }
  }, [contestId, isAdmin]);

  // Public refresh functions (non-blocking)
  const refreshContest = useCallback(async () => {
    if (onRefresh) {
      await onRefresh();
    } else {
      await fetchContest();
    }
  }, [onRefresh, fetchContest]);

  const refreshStandings = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchStandings(false); // Don't show full loading on refresh
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchStandings]);

  const refreshAdminData = useCallback(async () => {
    if (!isAdmin) return;
    setIsRefreshing(true);
    try {
      await fetchAdminData();
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchAdminData, isAdmin]);

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Fetch contest first to get updated permissions
      await fetchContest();
      // Then fetch other data in parallel
      const promises: Promise<void>[] = [fetchStandings(false)];
      // Only fetch admin data if user has permissions
      if (isAdmin) {
        promises.push(fetchAdminData());
      }
      await Promise.all(promises);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchContest, fetchStandings, fetchAdminData, isAdmin]);

  // Sync with initialContest from parent
  useEffect(() => {
    if (initialContest !== undefined) {
      setContest(initialContest);
      setLoading(false);
    }
  }, [initialContest]);

  // Initial fetch if no initialContest provided
  useEffect(() => {
    if (initialContest === undefined && contestId) {
      const init = async () => {
        setLoading(true);
        await fetchContest();
        setLoading(false);
      };
      init();
    }
  }, [contestId, initialContest, fetchContest]);

  // Fetch standings when contest is loaded
  useEffect(() => {
    if (contest?.id) {
      fetchStandings();
    }
  }, [contest?.id, fetchStandings]);

  // Fetch admin data when contest is loaded AND user is admin
  useEffect(() => {
    if (contest?.id && isAdmin) {
      fetchAdminData();
    }
  }, [contest?.id, isAdmin, fetchAdminData]);

  const value = useMemo(
    () => ({
      contest,
      loading,
      error,
      scoreboardData,
      standingsLoading,
      participants,
      examEvents,
      isRefreshing,
      refreshContest,
      refreshStandings,
      refreshAdminData,
      refreshAll,
    }),
    [
      contest,
      loading,
      error,
      scoreboardData,
      standingsLoading,
      participants,
      examEvents,
      isRefreshing,
      refreshContest,
      refreshStandings,
      refreshAdminData,
      refreshAll,
    ]
  );

  return (
    <ContestContext.Provider value={value}>{children}</ContestContext.Provider>
  );
};

export const useContest = (): ContestContextType => {
  const context = useContext(ContestContext);
  if (context === undefined) {
    throw new Error("useContest must be used within a ContestProvider");
  }
  return context;
};

export default ContestContext;
