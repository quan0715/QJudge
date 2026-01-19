import { useQuery } from "@tanstack/react-query";
import { getProblems } from "@/infrastructure/api/repositories/problem.repository";
import type { Difficulty, Problem } from "@/core/entities/problem.entity";

export interface ProblemListFilters {
  search: string;
  difficulties: Difficulty[];
  tagSlugs: string[];
  status: ("solved" | "unsolved")[];
}

const filterByStatus = (
  problems: Problem[],
  status: ProblemListFilters["status"]
) => {
  if (status.length === 0 || status.length > 1) return problems;
  const target = status[0];
  return problems.filter((p) => (target === "solved" ? p.isSolved : !p.isSolved));
};

export const useProblemList = (filters: ProblemListFilters) => {
  return useQuery({
    queryKey: ["problem-list", filters],
    queryFn: async () => {
      const problems = await getProblems({
        search: filters.search || undefined,
        difficulty: filters.difficulties.length ? filters.difficulties : undefined,
        tags: filters.tagSlugs.length ? filters.tagSlugs : undefined,
        // TODO: backend does not yet support status/page/page_size; filter locally and add TODO in PR
      });
      return filterByStatus(problems, filters.status);
    },
    staleTime: 60_000,
    gcTime: 300_000,
    retry: 1,
  });
};

export default useProblemList;
