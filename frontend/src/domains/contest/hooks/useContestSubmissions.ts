import { useQuery } from "@tanstack/react-query";
import { getSubmissions } from "@/services/submission";
import type { Submission } from "@/core/entities/submission.entity";

export interface ContestSubmissionsParams {
  contestId: string;
  page: number;
  pageSize: number;
  statusFilter?: string;
  problemFilter?: string;
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
}: ContestSubmissionsParams) => {
  return useQuery<ContestSubmissionsResult>({
    queryKey: [
      "contestSubmissions",
      contestId,
      page,
      pageSize,
      statusFilter,
      problemFilter,
    ],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        source_type: "contest",
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

      const data = await getSubmissions(params);
      return data;
    },
    enabled: !!contestId, // Only fetch when contestId is available
    staleTime: 30 * 1000, // Consider data fresh for 30 seconds
  });
};

export default useContestSubmissions;
