import { SUBMISSION_POLL_INTERVAL_MS } from "@/core/config/status.config";
import { useQuery } from "@tanstack/react-query";
import { getSubmissions } from "@/infrastructure/api/repositories/submission.repository";
import type { Submission } from "@/core/entities/submission.entity";

export interface ContestSubmissionsParams {
  contestId: string;
  page: number;
  pageSize: number;
  statusFilter?: string;
  problemFilter?: string;
  userId?: number | string; // Filter by user ID (for "only mine" filter)
  enabled?: boolean;
  /** Fetch again every time the list is shown, e.g. right after submitting. */
  refetchOnOpen?: boolean;
}

export interface ContestSubmissionsResult {
  results: Submission[];
  count: number;
}

/**
 * Custom hook for fetching contest submissions with React Query
 * Provides automatic caching, deduplication, and background updates
 */
export const useContestSubmissions = ({
  contestId,
  page,
  pageSize,
  statusFilter = "all",
  problemFilter = "all",
  userId,
  enabled = true,
  refetchOnOpen = false,
}: ContestSubmissionsParams) => {
  return useQuery<ContestSubmissionsResult>({
    queryKey: [
      "contestSubmissions",
      contestId,
      page,
      pageSize,
      statusFilter,
      problemFilter,
      userId,
    ],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        include_all: "true",
        contest: contestId,
        page: page,
        page_size: pageSize,
      };

      if (statusFilter !== "all") {
        params.status = statusFilter;
      }

      if (problemFilter !== "all") {
        params.problem = problemFilter;
      }

      if (userId) {
        params.user = userId;
      }

      const data = await getSubmissions(params);
      return data;
    },
    enabled: enabled && !!contestId, // Only fetch when contestId is available
    staleTime: 30 * 1000, // Consider data fresh for 30 seconds
    // A student's own list is reopened right after submitting, so it must not show a cached copy.
    refetchOnMount: refetchOnOpen ? "always" : true,
    // Keep polling while a listed submission is still waiting for the judge.
    refetchInterval: (query) =>
      query.state.data?.results?.some((row) => ["pending", "judging"].includes(String((row as { status?: string }).status)))
        ? SUBMISSION_POLL_INTERVAL_MS
        : false,
  });
};

export default useContestSubmissions;
