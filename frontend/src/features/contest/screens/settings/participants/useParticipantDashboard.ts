import { useCallback, useEffect, useState } from "react";

import type { ParticipantDashboard } from "@/core/entities/contest.entity";
import { getParticipantDashboard } from "@/infrastructure/api/repositories";

export const useParticipantDashboard = (
  contestId?: string,
  userId?: string | null,
) => {
  const [data, setData] = useState<ParticipantDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const refresh = useCallback(async () => {
    if (!contestId || !userId) {
      setData(null);
      setError("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    // Clear stale data when switching to a different user
    setData((prev) => (prev && String(prev.participant.userId) !== String(userId) ? null : prev));
    try {
      const next = await getParticipantDashboard(contestId, userId);
      setData(next);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Failed to fetch participant dashboard");
    } finally {
      setLoading(false);
    }
  }, [contestId, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    data,
    loading,
    error,
    refresh,
  };
};

export default useParticipantDashboard;
