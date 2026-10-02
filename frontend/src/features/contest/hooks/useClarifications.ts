import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { mapContestAnnouncementDto } from "@/infrastructure/mappers/contest.mapper";
import { getContestAnnouncements } from "@/infrastructure/api/repositories";

interface UseClarificationsOptions {
  pollIntervalMs?: number | null;
}

export const useClarifications = (contestId: string, options?: UseClarificationsOptions) => {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["contestClarifications", contestId, user?.id],
    queryFn: async () => {
      const annData = await getContestAnnouncements(contestId);
      return {
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
    announcements: data?.announcements ?? [],
    loading: isLoading,
    error,
    refresh,
  };
};
