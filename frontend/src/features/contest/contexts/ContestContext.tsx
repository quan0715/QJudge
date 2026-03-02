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
} from "@/infrastructure/api/repositories";
import type {
  ContestDetail,
  ScoreboardData,
} from "@/core/entities/contest.entity";

interface ContestContextType {
  // Core contest data
  contest: ContestDetail | null;
  loading: boolean;
  error: string | null;

  // Standings data
  scoreboardData: ScoreboardData | null;
  standingsLoading: boolean;

  // Refresh state (for button animation, not blocking)
  isRefreshing: boolean;

  // Granular refresh functions
  refreshContest: () => Promise<void>;
  refreshStandings: () => Promise<void>;
  refreshAll: () => Promise<void>;
}

const ContestContext = createContext<ContestContextType | undefined>(undefined);

interface ContestProviderProps {
  children: ReactNode;
  contestId?: string;
  /** Optional: provide initial contest data to avoid duplicate fetch */
  initialContest?: ContestDetail | null;
  /** Optional: provide initial scoreboard data to avoid duplicate fetch */
  initialScoreboardData?: ScoreboardData | null;
  /** Optional: external refresh function from parent */
  onRefresh?: () => Promise<void>;
}

export const ContestProvider: React.FC<ContestProviderProps> = ({
  children,
  contestId: propContestId,
  initialContest,
  initialScoreboardData,
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

  // Standings state
  const [scoreboardData, setScoreboardData] = useState<ScoreboardData | null>(
    initialScoreboardData || null
  );
  const [standingsLoading, setStandingsLoading] = useState(!initialScoreboardData);

  // Refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchContest = useCallback(async () => {
    if (!contestId) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const data = await getContest(contestId);
      setContest(data || null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load contest";
      setError(message);
      setContest(null);
    }
  }, [contestId]);

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

  const refreshContest = useCallback(async () => {
    if (onRefresh) {
      await onRefresh();
      return;
    }
    await fetchContest();
  }, [onRefresh, fetchContest]);

  const refreshStandings = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchStandings(false);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchStandings]);

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshContest();
      await fetchStandings(false);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshContest, fetchStandings]);

  // Sync with initialContest from parent
  useEffect(() => {
    if (initialContest !== undefined) {
      setContest(initialContest);
      setLoading(false);
    }
  }, [initialContest]);

  // Sync with initialScoreboardData from parent
  useEffect(() => {
    if (initialScoreboardData !== undefined) {
      setScoreboardData(initialScoreboardData);
      setStandingsLoading(false);
    }
  }, [initialScoreboardData]);

  // Initial fetch if no initialContest provided
  useEffect(() => {
    if (initialContest === undefined && contestId) {
      const init = async () => {
        setLoading(true);
        await fetchContest();
        setLoading(false);
      };
      void init();
    }
  }, [contestId, initialContest, fetchContest]);

  // Fetch standings when contest is loaded, ONLY if initialScoreboardData was NOT provided
  useEffect(() => {
    if (contest?.id && initialScoreboardData === undefined) {
      void fetchStandings();
    }
  }, [contest?.id, initialScoreboardData, fetchStandings]);

  const value = useMemo(
    () => ({
      contest,
      loading,
      error,
      scoreboardData,
      standingsLoading,
      isRefreshing,
      refreshContest,
      refreshStandings,
      refreshAll,
    }),
    [
      contest,
      loading,
      error,
      scoreboardData,
      standingsLoading,
      isRefreshing,
      refreshContest,
      refreshStandings,
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
