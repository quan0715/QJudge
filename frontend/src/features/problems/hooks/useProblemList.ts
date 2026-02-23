import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { getPaginatedProblems } from "@/infrastructure/api/repositories/problem.repository";
import type { Difficulty, Problem } from "@/core/entities/problem.entity";

export interface ProblemListFilters {
  search: string;
  difficulties: Difficulty[];
  tagSlugs: string[];
  status: ("solved" | "unsolved")[];
}

export interface ProblemListPagination {
  page: number;
  pageSize: number;
}

const filterByStatus = (
  problems: Problem[],
  status: ProblemListFilters["status"]
) => {
  if (status.length === 0 || status.length > 1) return problems;
  const target = status[0];
  return problems.filter((p) => (target === "solved" ? p.isSolved : !p.isSolved));
};

export const useProblemList = (
  filters: ProblemListFilters,
  pagination?: ProblemListPagination
) => {
  return useQuery({
    queryKey: ["problem-list", filters, pagination],
    queryFn: async () => {
      const result = await getPaginatedProblems({
        search: filters.search || undefined,
        difficulty: filters.difficulties.length ? filters.difficulties : undefined,
        tags: filters.tagSlugs.length ? filters.tagSlugs : undefined,
        page: pagination?.page || 1,
        page_size: pagination?.pageSize || 20,
      });

      // Apply client-side status filtering (backend doesn't support this yet)
      const filteredResults = filterByStatus(result.results, filters.status);

      return {
        problems: filteredResults,
        totalCount: result.count,
        hasNext: !!result.next,
        hasPrevious: !!result.previous,
      };
    },
    staleTime: 60_000,
    gcTime: 300_000,
    retry: 1,
  });
};

export const useInfiniteProblemList = (
  filters: ProblemListFilters,
  pageSize: number = 20
) => {
  return useInfiniteQuery({
    queryKey: ["problem-list-infinite", filters, pageSize],
    queryFn: async ({ pageParam }) => {
      const result = await getPaginatedProblems({
        search: filters.search || undefined,
        difficulty: filters.difficulties.length ? filters.difficulties : undefined,
        tags: filters.tagSlugs.length ? filters.tagSlugs : undefined,
        page: pageParam,
        page_size: pageSize,
      });

      const filteredResults = filterByStatus(result.results, filters.status);

      return {
        problems: filteredResults,
        totalCount: result.count,
        nextPage: result.next ? pageParam + 1 : undefined,
      };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    staleTime: 60_000,
    gcTime: 300_000,
    retry: 1,
  });
};

export default useProblemList;
