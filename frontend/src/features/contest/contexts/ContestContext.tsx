import React, {
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
import { useExamRuntimeState, mergeExamRuntimeState } from "../hooks/useExamRuntimeState";
import { IntegrityUploadProvider } from "./IntegrityUploadProvider";
import { LiveMonitoringProvider } from "./LiveMonitoringProvider";
import ContestContext, { type ContestContextType } from "./ContestValueContext";

interface ContestProviderProps {
  runtime?: ReturnType<typeof useExamRuntimeState>;
  enableRuntimePolling?: boolean;
  children: ReactNode;
  contestId?: string;
  /** Optional: provide initial contest data to avoid duplicate fetch */
  initialContest?: ContestDetail | null;
  /** Optional: provide initial scoreboard data to avoid duplicate fetch */
  initialScoreboardData?: ScoreboardData | null;
  /** Optional: external refresh function from parent */
  onRefresh?: () => Promise<void>;
  /** Precheck must not create a publisher before the answering surface mounts. */
  enableLiveMonitoring?: boolean;
}

export const ContestProvider: React.FC<ContestProviderProps> = ({
  children,
  contestId: propContestId,
  initialContest,
  initialScoreboardData,
  onRefresh,
  runtime: externalRuntime,
  enableRuntimePolling = true,
  enableLiveMonitoring = true,
}) => {
  const params = useParams<{ contestId?: string }>();
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
  const ownRuntime = useExamRuntimeState(
    !externalRuntime && enableRuntimePolling && contest?.hasJoined
      ? contestId
      : undefined,
  );
  const runtime = externalRuntime ?? ownRuntime;
  const currentContest = useMemo(() => mergeExamRuntimeState(contest, runtime.state), [contest, runtime.state]);

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
    void runtime.refresh();
  }, [onRefresh, fetchContest, runtime.refresh]);

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

  // Standings are lazy-loaded — only fetched when entering the standings tab.

  const value = useMemo(
    () => ({
      contest: currentContest,
      runtime,
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
      currentContest,
      runtime,
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

  const contestContent = (
    <IntegrityUploadProvider contestId={contestId ?? ""} runtimeState={runtime.state}>
      {children}
    </IntegrityUploadProvider>
  );

  return (
    <ContestContext.Provider value={value}>
      {enableLiveMonitoring ? (
        <LiveMonitoringProvider contestId={contestId ?? ""} runtimeState={runtime.state}>
          {contestContent}
        </LiveMonitoringProvider>
      ) : (
        contestContent
      )}
    </ContestContext.Provider>
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
