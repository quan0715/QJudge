import { useCallback, useEffect, useState } from "react";
import type {
  Clarification,
  ContestAnnouncement,
} from "@/core/entities/contest.entity";
import {
  mapClarificationDto,
  mapContestAnnouncementDto,
} from "@/infrastructure/mappers/contest.mapper";
import {
  getClarifications,
  getContestAnnouncements,
} from "@/infrastructure/api/repositories";
import { useInterval } from "@/shared/hooks/useInterval";

export const useClarifications = (contestId: string) => {
  const [clarifications, setClarifications] = useState<Clarification[]>([]);
  const [announcements, setAnnouncements] = useState<ContestAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(
    async (showLoading = false) => {
      if (!contestId) return;
      if (showLoading) {
        setLoading(true);
      }
      try {
        const [clarData, annData] = await Promise.all([
          getClarifications(contestId),
          getContestAnnouncements(contestId),
        ]);

        // Handle clarifications
        let rawClars: any[] = [];
        if (clarData && typeof clarData === "object" && "results" in clarData) {
          rawClars = (clarData as any).results;
        } else if (Array.isArray(clarData)) {
          rawClars = clarData;
        }
        setClarifications(rawClars.map(mapClarificationDto));

        // Handle announcements
        let rawAnns: any[] = [];
        if (Array.isArray(annData)) {
          rawAnns = annData;
        }
        setAnnouncements(rawAnns.map(mapContestAnnouncementDto));
        setError(null);
      } catch (err) {
        setError(err as Error);
        console.error("Failed to fetch clarifications data", err);
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [contestId]
  );

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  useInterval(() => {
    fetchData(false);
  }, contestId ? 30000 : null);

  return {
    clarifications,
    announcements,
    loading,
    error,
    refresh: () => fetchData(false),
  };
};
