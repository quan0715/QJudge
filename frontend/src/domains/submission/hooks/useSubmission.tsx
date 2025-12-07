import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getSubmission, getSubmissions } from '@/services/submission';
import type { Submission, SubmissionDetail } from '@/core/entities/submission.entity';

interface SubmissionContextType {
  submission: SubmissionDetail | null;
  submissions: Submission[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  refreshSubmission: () => Promise<void>;
  refreshSubmissions: (params?: any) => Promise<void>;
}

const SubmissionContext = createContext<SubmissionContextType | undefined>(undefined);

interface SubmissionProviderProps {
  children: ReactNode;
  submissionId?: string;
  /** Optional: problem ID for filtering submissions */
  problemId?: string;
  /** Optional: contest ID for filtering submissions */
  contestId?: string;
  /** Optional: provide initial submission data to avoid duplicate fetch */
  initialSubmission?: SubmissionDetail | null;
  /** Optional: provide initial submissions list */
  initialSubmissions?: Submission[];
  /** Optional: external refresh function from parent */
  onRefresh?: () => Promise<void>;
}

export const SubmissionProvider: React.FC<SubmissionProviderProps> = ({
  children,
  submissionId: propSubmissionId,
  problemId,
  contestId,
  initialSubmission,
  initialSubmissions,
  onRefresh
}) => {
  const params = useParams<{ submissionId: string }>();
  const [searchParams] = useSearchParams();
  const submissionId = propSubmissionId || params.submissionId || searchParams.get('submission_id');

  const [submission, setSubmission] = useState<SubmissionDetail | null>(initialSubmission || null);
  const [submissions, setSubmissions] = useState<Submission[]>(initialSubmissions || []);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(!initialSubmission && !initialSubmissions);
  const [error, setError] = useState<string | null>(null);

  const fetchSubmission = useCallback(async () => {
    if (!submissionId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await getSubmission(submissionId);
      setSubmission(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load submission');
      setSubmission(null);
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  const fetchSubmissions = useCallback(async (filterParams?: any) => {
    try {
      setLoading(true);
      setError(null);
      const params = {
        ...filterParams,
        ...(problemId && { problem: problemId }),
        ...(contestId && { contest: contestId })
      };
      const { results, count } = await getSubmissions(params);
      setSubmissions(results);
      setTotalCount(count);
    } catch (err: any) {
      setError(err.message || 'Failed to load submissions');
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [problemId, contestId]);

  const refreshSubmission = useCallback(async () => {
    if (onRefresh) {
      await onRefresh();
    } else {
      await fetchSubmission();
    }
  }, [onRefresh, fetchSubmission]);

  const refreshSubmissions = useCallback(async (params?: any) => {
    await fetchSubmissions(params);
  }, [fetchSubmissions]);

  // Sync with initialSubmission from parent
  useEffect(() => {
    if (initialSubmission !== undefined) {
      setSubmission(initialSubmission);
      setLoading(false);
    }
  }, [initialSubmission]);

  // Sync with initialSubmissions from parent
  useEffect(() => {
    if (initialSubmissions !== undefined) {
      setSubmissions(initialSubmissions);
      setTotalCount(initialSubmissions.length);
      setLoading(false);
    }
  }, [initialSubmissions]);

  // Fetch single submission if ID is provided
  useEffect(() => {
    if (initialSubmission === undefined && submissionId) {
      fetchSubmission();
    }
  }, [submissionId, initialSubmission, fetchSubmission]);

  return (
    <SubmissionContext.Provider value={{ 
      submission, 
      submissions, 
      totalCount, 
      loading, 
      error, 
      refreshSubmission,
      refreshSubmissions 
    }}>
      {children}
    </SubmissionContext.Provider>
  );
};

export const useSubmission = (): SubmissionContextType => {
  const context = useContext(SubmissionContext);
  if (context === undefined) {
    throw new Error('useSubmission must be used within a SubmissionProvider');
  }
  return context;
};

export default SubmissionContext;
