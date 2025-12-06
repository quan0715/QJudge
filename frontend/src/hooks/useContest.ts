import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api';
import type { ContestDetail } from '@/core/entities/contest.entity';

export const useContest = (contestId: string | undefined) => {
  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadContest = useCallback(async () => {
    if (!contestId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await api.getContest(contestId);
      setContest(data || null);
    } catch (err) {
      console.error('Failed to load contest', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [contestId]);

  useEffect(() => {
    loadContest();
  }, [loadContest]);

  return { contest, loading, error, refresh: loadContest };
};
