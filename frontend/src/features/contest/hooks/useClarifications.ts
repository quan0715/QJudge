import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { mapClarificationDto, mapContestAnnouncementDto } from "@/infrastructure/mappers/contest.mapper";
import { getClarifications, getContestAnnouncements } from "@/infrastructure/api/repositories";

interface UseClarificationsOptions {
  pollIntervalMs?: number | null;
}

export const useClarifications = (contestId: string, options?: UseClarificationsOptions) => {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["contestClarifications", contestId, user?.id],
    queryFn: async () => {
      const [clarData, annData] = await Promise.all([
        getClarifications(contestId),
        getContestAnnouncements(contestId),
      ]);
      const rawQuestions = Array.isArray(clarData)
        ? clarData
        : (clarData as { results?: unknown[] } | null)?.results ?? [];
      return {
        clarifications: rawQuestions.map(mapClarificationDto),
        announcements: (Array.isArray(annData) ? annData : []).map(mapContestAnnouncementDto),
      };
    },
    enabled: !!contestId,
    refetchInterval: options?.pollIntervalMs || false,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const refresh = useCallback(async () => { await refetch(); }, [refetch]);
  return {
    clarifications: data?.clarifications ?? [],
    announcements: data?.announcements ?? [],
    loading: isLoading,
    error,
    refresh,
  };
};
