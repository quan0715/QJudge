import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPaginatedProblems, deleteProblem } from "@/infrastructure/api/repositories/problem.repository";
import type { PaginatedProblems } from "@/core/ports/problem.repository";

interface UseTeacherProblemsParams {
  page?: number;
  pageSize?: number;
}

export const useTeacherProblems = (params?: UseTeacherProblemsParams) => {
  const queryClient = useQueryClient();
  const page = params?.page || 1;
  const pageSize = params?.pageSize || 20;

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<PaginatedProblems>({
    queryKey: ["problems", "manage", page, pageSize],
    queryFn: () => getPaginatedProblems({
      scope: "manage",
      page,
      page_size: pageSize,
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProblem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["problems", "manage"] });
    },
  });

  return {
    problems: data?.results || [],
    totalCount: data?.count || 0,
    hasNext: !!data?.next,
    hasPrevious: !!data?.previous,
    isLoading,
    error,
    refetch,
    deleteProblem: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
  };
};
