import {
  createContext,
  useContext,
  type ReactNode,
  useMemo,
  useCallback,
  useState,
} from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getProblem, getProblemStatistics } from "@/infrastructure/api/repositories/problem.repository";
import { getSubmissions } from "@/infrastructure/api/repositories/submission.repository";
import type { ProblemDetail } from "@/core/entities/problem.entity";
import type { Submission } from "@/core/entities/submission.entity";

// ============================================================================
// Types
// ============================================================================

export interface ProblemStatistics {
  submissionCount: number;
  acceptedCount: number;
  acRate: number;
  statusCounts: Record<string, number>;
  trend: Array<{ date: string; count: number }>;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  execTime: number;
  language: string;
}

export interface SubmissionsParams {
  page: number;
  pageSize: number;
  statusFilter?: string;
  onlyMine?: boolean;
  userId?: number;
}

export interface SubmissionsResult {
  results: Submission[];
  count: number;
}

// ============================================================================
// Context Types
// ============================================================================

interface ProblemContextType {
  // Problem data
  problem: ProblemDetail | null;
  problemLoading: boolean;
  problemError: Error | null;
  refetchProblem: () => void;

  // Statistics data
  statistics: ProblemStatistics | null;
  statisticsLoading: boolean;
  statisticsError: Error | null;
  refetchStatistics: () => void;

  // Leaderboard data
  leaderboard: LeaderboardEntry[];
  leaderboardLoading: boolean;
  leaderboardError: Error | null;
  refetchLeaderboard: () => void;

  // Submissions data (with pagination)
  submissions: Submission[];
  submissionsCount: number;
  submissionsLoading: boolean;
  submissionsError: Error | null;
  submissionsParams: SubmissionsParams;
  setSubmissionsParams: (params: Partial<SubmissionsParams>) => void;
  refetchSubmissions: () => void;

  // Context info
  contestId?: string;
}

const ProblemContext = createContext<ProblemContextType | undefined>(undefined);

// ============================================================================
// Provider Props
// ============================================================================

interface ProblemProviderProps {
  children: ReactNode;
  problemId?: string;
  contestId?: string;
  /** Optional: provide initial problem data to avoid duplicate fetch */
  initialProblem?: ProblemDetail | null;
}

// ============================================================================
// Provider Component
// ============================================================================

export const ProblemProvider: React.FC<ProblemProviderProps> = ({
  children,
  problemId: propProblemId,
  contestId,
  initialProblem,
}) => {
  const params = useParams<{ problemId: string }>();
  const problemId = propProblemId || params.problemId;

  // Get current user for "only mine" filter
  const currentUser = useMemo(() => {
    if (typeof window === "undefined") return null;
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        return JSON.parse(userStr);
      } catch {
        return null;
      }
    }
    return null;
  }, []);

  // Submissions params state
  const [submissionsParams, setSubmissionsParamsState] =
    useState<SubmissionsParams>({
      page: 1,
      pageSize: 10,
      statusFilter: "all",
      onlyMine: false,
      userId: currentUser?.id,
    });

  const setSubmissionsParams = useCallback(
    (newParams: Partial<SubmissionsParams>) => {
      setSubmissionsParamsState((prev) => ({
        ...prev,
        ...newParams,
        // Reset to page 1 when filter changes
        page:
          newParams.statusFilter !== undefined ||
          newParams.onlyMine !== undefined
            ? 1
            : newParams.page ?? prev.page,
      }));
    },
    []
  );

  // ========================================
  // Query: Problem Data
  // ========================================
  const {
    data: problem,
    isLoading: problemLoading,
    error: problemError,
    refetch: refetchProblem,
  } = useQuery({
    queryKey: ["problem", problemId, contestId],
    queryFn: async () => {
      if (!problemId) return null;
      const scope = contestId ? "contest" : undefined;
      const data = await getProblem(problemId, scope);
      return data || null;
    },
    enabled: !!problemId && !initialProblem,
    initialData: initialProblem || undefined,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // ========================================
  // Query: Problem Statistics
  // ========================================
  const {
    data: statistics,
    isLoading: statisticsLoading,
    error: statisticsError,
    refetch: refetchStatistics,
  } = useQuery({
    queryKey: ["problemStatistics", problemId, contestId],
    queryFn: async () => {
      if (!problemId) return null;
      const stats = await getProblemStatistics(problemId, {
        contest: contestId,
        limit: 100,
      });
      return stats;
    },
    enabled: !!problemId,
    staleTime: 1000 * 30, // 30 seconds
  });

  // ========================================
  // Query: Leaderboard (Top 10 Fastest AC)
  // ========================================
  const {
    data: leaderboardData,
    isLoading: leaderboardLoading,
    error: leaderboardError,
    refetch: refetchLeaderboard,
  } = useQuery({
    queryKey: ["problemLeaderboard", problemId, contestId],
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      if (!problemId) return [];

      // Fetch top 10 fastest AC submissions
      const { results } = await getSubmissions({
        problem: problemId,
        status: "AC",
        ordering: "exec_time",
        page_size: 10,
        is_test: 0,
        contest: contestId,
        source_type: contestId ? "contest" : undefined,
      });

      if (!results || results.length === 0) return [];

      // Group by user and keep only the fastest submission per user
      const userBestTimes = new Map<
        string,
        { execTime: number; language: string }
      >();

      results.forEach((sub) => {
        const username = sub.username || "Unknown";
        const execTime = sub.execTime ?? 0;

        if (
          !userBestTimes.has(username) ||
          userBestTimes.get(username)!.execTime > execTime
        ) {
          userBestTimes.set(username, {
            execTime,
            language: sub.language || "unknown",
          });
        }
      });

      // Convert to array and sort by exec time
      const leaderboardList: LeaderboardEntry[] = Array.from(
        userBestTimes.entries()
      )
        .map(([username, data]) => ({
          rank: 0,
          username,
          execTime: data.execTime,
          language: data.language,
        }))
        .sort((a, b) => a.execTime - b.execTime)
        .slice(0, 5)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));

      return leaderboardList;
    },
    enabled: !!problemId,
    staleTime: 1000 * 60, // 1 minute
  });

  // ========================================
  // Query: Submissions with Pagination
  // ========================================
  const {
    data: submissionsData,
    isLoading: submissionsLoading,
    error: submissionsError,
    refetch: refetchSubmissions,
  } = useQuery({
    queryKey: [
      "problemSubmissions",
      problemId,
      contestId,
      submissionsParams.page,
      submissionsParams.pageSize,
      submissionsParams.statusFilter,
      submissionsParams.onlyMine,
      currentUser?.id,
    ],
    queryFn: async (): Promise<SubmissionsResult> => {
      if (!problemId) return { results: [], count: 0 };

      const params: Record<string, any> = {
        problem: problemId,
        ordering: "-created_at",
        is_test: 0,
        page: submissionsParams.page,
        page_size: submissionsParams.pageSize,
      };

      if (contestId) {
        params.contest = contestId;
        params.source_type = "contest";
      }

      if (
        submissionsParams.statusFilter &&
        submissionsParams.statusFilter !== "all"
      ) {
        params.status = submissionsParams.statusFilter;
      }

      if (submissionsParams.onlyMine && currentUser?.id) {
        params.user = currentUser.id;
      }

      const data = await getSubmissions(params);
      return data;
    },
    enabled: !!problemId,
    staleTime: 1000 * 15, // 15 seconds
  });

  // ========================================
  // Context Value
  // ========================================
  const value = useMemo<ProblemContextType>(
    () => ({
      // Problem
      problem: problem || null,
      problemLoading,
      problemError: problemError as Error | null,
      refetchProblem,

      // Statistics
      statistics: statistics || null,
      statisticsLoading,
      statisticsError: statisticsError as Error | null,
      refetchStatistics,

      // Leaderboard
      leaderboard: leaderboardData || [],
      leaderboardLoading,
      leaderboardError: leaderboardError as Error | null,
      refetchLeaderboard,

      // Submissions
      submissions: submissionsData?.results || [],
      submissionsCount: submissionsData?.count || 0,
      submissionsLoading,
      submissionsError: submissionsError as Error | null,
      submissionsParams,
      setSubmissionsParams,
      refetchSubmissions,

      // Context
      contestId,
    }),
    [
      problem,
      problemLoading,
      problemError,
      refetchProblem,
      statistics,
      statisticsLoading,
      statisticsError,
      refetchStatistics,
      leaderboardData,
      leaderboardLoading,
      leaderboardError,
      refetchLeaderboard,
      submissionsData,
      submissionsLoading,
      submissionsError,
      submissionsParams,
      setSubmissionsParams,
      refetchSubmissions,
      contestId,
    ]
  );

  return (
    <ProblemContext.Provider value={value}>{children}</ProblemContext.Provider>
  );
};

// ============================================================================
// Hook
// ============================================================================

export const useProblem = (): ProblemContextType => {
  const context = useContext(ProblemContext);
  if (context === undefined) {
    throw new Error("useProblem must be used within a ProblemProvider");
  }
  return context;
};

// ============================================================================
// Convenience Hooks for specific data
// ============================================================================

/** Hook for problem statistics only */
export const useProblemStatistics = () => {
  const { statistics, statisticsLoading, statisticsError, refetchStatistics } =
    useProblem();
  return {
    statistics,
    loading: statisticsLoading,
    error: statisticsError,
    refetch: refetchStatistics,
  };
};

/** Hook for leaderboard only */
export const useProblemLeaderboard = () => {
  const {
    leaderboard,
    leaderboardLoading,
    leaderboardError,
    refetchLeaderboard,
  } = useProblem();
  return {
    leaderboard,
    loading: leaderboardLoading,
    error: leaderboardError,
    refetch: refetchLeaderboard,
  };
};

/** Hook for submissions with pagination */
export const useProblemSubmissions = () => {
  const {
    submissions,
    submissionsCount,
    submissionsLoading,
    submissionsError,
    submissionsParams,
    setSubmissionsParams,
    refetchSubmissions,
  } = useProblem();
  return {
    submissions,
    count: submissionsCount,
    loading: submissionsLoading,
    error: submissionsError,
    params: submissionsParams,
    setParams: setSubmissionsParams,
    refetch: refetchSubmissions,
  };
};

export default ProblemContext;
