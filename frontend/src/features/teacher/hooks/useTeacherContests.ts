import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getContests,
  deleteContest,
} from "@/infrastructure/api/repositories/contest.repository";
import type { Contest } from "@/core/entities/contest.entity";

export const useTeacherContests = () => {
  const queryClient = useQueryClient();

  const {
    data: contests = [],
    isLoading,
    error,
    refetch,
  } = useQuery<Contest[]>({
    queryKey: ["contests", "manage"],
    queryFn: () => getContests("manage"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteContest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contests", "manage"] });
    },
  });

  return {
    contests,
    isLoading,
    error,
    refetch,
    deleteContest: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
  };
};
