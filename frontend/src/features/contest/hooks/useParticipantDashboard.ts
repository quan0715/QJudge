import { useCallback, useEffect, useRef, useState } from "react";

import type { ParticipantDashboard } from "@/core/entities/contest.entity";
import { getParticipantDashboard } from "@/infrastructure/api/repositories";

export const useParticipantDashboard = (
  contestId: string | undefined,
  userId: string | null | undefined,
  options: { refreshIntervalMs?: number } = {},
) => {
  const { refreshIntervalMs } = options;
  const [data, setData] = useState<ParticipantDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inFlightRef = useRef(false);
  const trailingRef = useRef(false);
  const requestKeyRef = useRef("");

  const refresh = useCallback(async (): Promise<void> => {
    if (!contestId || !userId) {
      setData(null);
      setError("");
      setLoading(false);
      return;
    }
    if (inFlightRef.current) {
      // A refresh asked for mid-flight (e.g. after an action) must still run once.
      trailingRef.current = true;
      return;
    }
    inFlightRef.current = true;
    setLoading(true);
    setError("");
    // Clear stale data when switching to a different user.
    setData((prev) => (prev && String(prev.participant.userId) !== String(userId) ? null : prev));
    const requestKey = `${contestId}:${userId}`;
    requestKeyRef.current = requestKey;
    try {
      const next = await getParticipantDashboard(contestId, userId);
      if (requestKeyRef.current === requestKey) setData(next);
    } catch (err) {
      if (requestKeyRef.current !== requestKey) return;
      // Keep the last good data for this user; only report the error.
      setError(err instanceof Error ? err.message : "Failed to fetch participant dashboard");
    } finally {
      if (requestKeyRef.current === requestKey) {
        inFlightRef.current = false;
        setLoading(false);
      }
    }
    if (trailingRef.current && requestKeyRef.current === requestKey) {
      trailingRef.current = false;
      await refresh();
    }
  }, [contestId, userId]);

  useEffect(() => {
    // A new user must load even if the previous user's request is still pending.
    inFlightRef.current = false;
    trailingRef.current = false;
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!refreshIntervalMs || !contestId || !userId) return;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, refreshIntervalMs);
    return () => window.clearInterval(intervalId);
  }, [contestId, refresh, refreshIntervalMs, userId]);

  return { data, loading, error, refresh };
};

export default useParticipantDashboard;
