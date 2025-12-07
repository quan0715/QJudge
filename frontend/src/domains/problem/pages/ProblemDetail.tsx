import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loading } from '@carbon/react';
import ProblemSolver from '../components/ProblemSolver';
import type { ProblemDetail as Problem } from '@/core/entities/problem.entity';
import type { SubmissionDetail as Submission } from '@/core/entities/submission.entity';
import { submitSolution } from '@/services/submission';
import { getProblem } from '@/services/problem';

const ProblemDetail = () => {
  const { id } = useParams<{ id: string }>();

  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProblem = async () => {
      if (!id) return;
        try {
          const fetchedProblem = await getProblem(id);
          
          if (!fetchedProblem) throw new Error('Failed to fetch problem');
          
          setProblem(fetchedProblem);
      } catch (err) {
        setError('無法載入題目資料');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchProblem();
  }, [id]);

  const handleSubmit = async (code: string, language: string, isTest: boolean, customTestCases?: any[]): Promise<Submission | void> => {
    if (!problem) return;

    try {
        const result = await submitSolution({
            problem_id: problem.id,
            language: language,
            code: code,
            is_test: isTest,
            custom_test_cases: customTestCases,
            contest_id: undefined
        });
        return result;
    } catch (err: any) {
        throw new Error(err.message || '提交失敗，請檢查輸入並稍後再試');
    }
  };

  const handleProblemUpdate = (updatedProblem: Problem) => {
    setProblem(updatedProblem);
  };

  // Loading state
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        minHeight: 'calc(100vh - 48px)',
        backgroundColor: 'var(--cds-background)'
      }}>
        <Loading />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{ 
        padding: '2rem', 
        textAlign: 'center', 
        color: 'var(--cds-text-error)',
        minHeight: 'calc(100vh - 48px)',
        backgroundColor: 'var(--cds-background)'
      }}>
        {error}
      </div>
    );
  }

  // No problem found
  if (!problem) {
    return (
      <div style={{ 
        padding: '2rem', 
        textAlign: 'center',
        minHeight: 'calc(100vh - 48px)',
        backgroundColor: 'var(--cds-background)'
      }}>
        題目不存在
      </div>
    );
  }

  // Render ProblemSolver (which includes Hero + Tabs + Content)
  return (
    <ProblemSolver
      problem={problem}
      onSubmit={handleSubmit}
      onProblemUpdate={handleProblemUpdate}
    />
  );
};

export default ProblemDetail;
