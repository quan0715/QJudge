import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProblem } from "@/infrastructure/api/repositories/problem.repository";
// import type { ProblemDetail } from "@/core/entities/problem.entity";
import { problemDetailToFormSchema } from "@/features/problems/forms/problemFormAdapters";

// ============================================================================
// Query Keys Factory
// ============================================================================

export const problemKeys = {
  all: ["problems"] as const,
  lists: () => [...problemKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) =>
    [...problemKeys.lists(), filters] as const,
  details: () => [...problemKeys.all, "detail"] as const,
  detail: (id: string, scope?: string) =>
    [...problemKeys.details(), id, scope] as const,
};

// ============================================================================
// Lightweight Hook for Problem Detail (without Context)
// ============================================================================

interface UseProblemDetailOptions {
  /** Scope for fetching: 'manage' for admin/teacher, 'contest' for contest view */
  scope?: string;
  /** Whether to enable the query (defaults to true when id is present) */
  enabled?: boolean;
}

/**
 * Lightweight hook for fetching a single problem's detail using React Query.
 *
 * Features:
 * - Lazy loading: only fetches when problemId is provided
 * - Caching: 5-minute stale time
 * - Returns both raw entity and transformed form schema
 *
 * @param problemId - The problem ID to fetch (null/undefined disables the query)
 * @param options - Additional options
 *
 * @example
 * ```tsx
 * const { problem, formSchema, isLoading, error } = useProblemDetail(selectedProblemId, { scope: "manage" });
 * ```
 */
export function useProblemDetail(
  problemId: string | null | undefined,
  options: UseProblemDetailOptions = {}
) {
  const { scope = "manage", enabled = true } = options;

  const query = useQuery({
    queryKey: problemKeys.detail(problemId!, scope),
    queryFn: async () => {
      if (!problemId) return null;
      const data = await getProblem(problemId, scope);
      return data || null;
    },
    enabled: !!problemId && enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes (formerly cacheTime)
  });

  // Memoize the form schema transformation
  const formSchema = useMemo(
    () => problemDetailToFormSchema(query.data),
    [query.data]
  );

  return {
    // Raw entity data
    problem: query.data,
    // Transformed form schema (for react-hook-form)
    formSchema,
    // Query state
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error as Error | null,
    // Actions
    refetch: query.refetch,
  };
}

export default useProblemDetail;
