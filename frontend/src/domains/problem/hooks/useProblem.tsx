import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { getProblem } from '@/services/problem';
import type { ProblemDetail } from '@/core/entities/problem.entity';

interface ProblemContextType {
  problem: ProblemDetail | null;
  loading: boolean;
  error: string | null;
  refreshProblem: () => Promise<void>;
}

const ProblemContext = createContext<ProblemContextType | undefined>(undefined);

interface ProblemProviderProps {
  children: ReactNode;
  problemId?: string;
  /** Optional: contest context for fetching problem in contest scope */
  contestId?: string;
  /** Optional: provide initial problem data to avoid duplicate fetch */
  initialProblem?: ProblemDetail | null;
  /** Optional: external refresh function from parent */
  onRefresh?: () => Promise<void>;
}

export const ProblemProvider: React.FC<ProblemProviderProps> = ({
  children,
  problemId: propProblemId,
  contestId,
  initialProblem,
  onRefresh
}) => {
  const params = useParams<{ problemId: string }>();
  const problemId = propProblemId || params.problemId;

  const [problem, setProblem] = useState<ProblemDetail | null>(initialProblem || null);
  const [loading, setLoading] = useState(!initialProblem);
  const [error, setError] = useState<string | null>(null);

  const fetchProblem = useCallback(async () => {
    if (!problemId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      // Use contest scope if contestId is provided
      const scope = contestId ? 'contest' : undefined;
      const data = await getProblem(problemId, scope);
      setProblem(data || null);
    } catch (err: any) {
      setError(err.message || 'Failed to load problem');
      setProblem(null);
    } finally {
      setLoading(false);
    }
  }, [problemId, contestId]);

  const refreshProblem = useCallback(async () => {
    if (onRefresh) {
      await onRefresh();
    } else {
      await fetchProblem();
    }
  }, [onRefresh, fetchProblem]);

  // Sync with initialProblem from parent
  useEffect(() => {
    if (initialProblem !== undefined) {
      setProblem(initialProblem);
      setLoading(false);
    }
  }, [initialProblem]);

  // Only fetch if no initialProblem provided
  useEffect(() => {
    if (initialProblem === undefined && problemId) {
      fetchProblem();
    }
  }, [problemId, contestId, initialProblem, fetchProblem]);

  return (
    <ProblemContext.Provider value={{ problem, loading, error, refreshProblem }}>
      {children}
    </ProblemContext.Provider>
  );
};

export const useProblem = (): ProblemContextType => {
  const context = useContext(ProblemContext);
  if (context === undefined) {
    throw new Error('useProblem must be used within a ProblemProvider');
  }
  return context;
};

export default ProblemContext;
