import { useCallback, useEffect, useState } from "react";
import type { ContestAnticheatConfig } from "@/core/entities/contest.entity";
import { getContestAnticheatConfig } from "@/infrastructure/api/repositories/contest.repository";

interface UseContestAnticheatConfigResult {
  config: ContestAnticheatConfig | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useContestAnticheatConfig(contestId?: string): UseContestAnticheatConfigResult {
  const [config, setConfig] = useState<ContestAnticheatConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!contestId) {
      setConfig(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const next = await getContestAnticheatConfig(contestId);
      setConfig(next);
    } catch (err) {
      setConfig(null);
      setError(err instanceof Error ? err : new Error("Failed to fetch anti-cheat config"));
    } finally {
      setLoading(false);
    }
  }, [contestId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { config, loading, error, refresh: load };
}
