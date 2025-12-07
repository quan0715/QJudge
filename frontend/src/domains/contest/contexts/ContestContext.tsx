import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { getContest } from '@/services/contest';
import type { ContestDetail } from '@/core/entities/contest.entity';

interface ContestContextType {
  contest: ContestDetail | null;
  loading: boolean;
  error: string | null;
  refreshContest: () => Promise<void>;
}

const ContestContext = createContext<ContestContextType | undefined>(undefined);

interface ContestProviderProps {
  children: ReactNode;
  contestId?: string;
  /** Optional: provide initial contest data to avoid duplicate fetch */
  initialContest?: ContestDetail | null;
  /** Optional: external refresh function from parent */
  onRefresh?: () => Promise<void>;
}

export const ContestProvider: React.FC<ContestProviderProps> = ({ 
  children, 
  contestId: propContestId,
  initialContest,
  onRefresh 
}) => {
  const params = useParams<{ contestId: string }>();
  const contestId = propContestId || params.contestId;
  
  const [contest, setContest] = useState<ContestDetail | null>(initialContest || null);
  const [loading, setLoading] = useState(!initialContest);
  const [error, setError] = useState<string | null>(null);

  const fetchContest = useCallback(async () => {
    if (!contestId) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      const data = await getContest(contestId);
      setContest(data || null);
    } catch (err: any) {
      setError(err.message || 'Failed to load contest');
      setContest(null);
    } finally {
      setLoading(false);
    }
  }, [contestId]);

  const refreshContest = useCallback(async () => {
    // If parent provides refresh function, use it
    if (onRefresh) {
      await onRefresh();
      // Parent should update initialContest which will sync via useEffect
    } else {
      await fetchContest();
    }
  }, [onRefresh, fetchContest]);

  // Sync with initialContest from parent
  useEffect(() => {
    if (initialContest !== undefined) {
      setContest(initialContest);
      setLoading(false);
    }
  }, [initialContest]);

  // Only fetch if no initialContest provided
  useEffect(() => {
    if (initialContest === undefined && contestId) {
      fetchContest();
    }
  }, [contestId, initialContest, fetchContest]);

  return (
    <ContestContext.Provider value={{ contest, loading, error, refreshContest }}>
      {children}
    </ContestContext.Provider>
  );
};

export const useContest = (): ContestContextType => {
  const context = useContext(ContestContext);
  if (context === undefined) {
    throw new Error('useContest must be used within a ContestProvider');
  }
  return context;
};

export default ContestContext;
