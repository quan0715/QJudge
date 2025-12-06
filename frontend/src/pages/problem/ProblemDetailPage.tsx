import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loading } from '@carbon/react';
import ProblemSolver from '@/components/problem/ProblemSolver';
import type { ProblemDetail as Problem } from '@/core/entities/problem.entity';
import type { SubmissionDetail as Submission } from '@/core/entities/submission.entity';
import { submissionService } from '@/services/submissionService';
import { problemService } from '@/services/problemService';
import ContentPageLayout from '@/layouts/ContentPageLayout';
import ProblemHero from '@/components/problem/layout/ProblemHero';

const ProblemDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProblem = async () => {
      if (!id) return;
        try {
          const fetchedProblem = await problemService.getProblem(id);
          
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
        const result = await submissionService.submitSolution({
            problem_id: problem.id,
            language: language,
            code: code,
            is_test: isTest,
            custom_test_cases: customTestCases,
            contest_id: undefined // Add contest support later if needed
        });
        return result;
    } catch (err: any) {
        throw new Error(err.message || '提交失敗，請檢查輸入並稍後再試');
    }
  };

  return (
    <ContentPageLayout
      hero={<ProblemHero problem={problem} loading={loading} />}
    >
      {loading ? (
         <div style={{ padding: '2rem' }}><Loading /></div>
      ) : error ? (
         <div style={{ padding: '2rem' }}>{error}</div>
      ) : !problem ? (
         <div style={{ padding: '2rem' }}>題目不存在</div>
      ) : (
        <ProblemSolver
          problem={problem}
          onSubmit={handleSubmit}
          isContestMode={false}
          hideHero={true}
        />
      )}
    </ContentPageLayout>
  );
};

export default ProblemDetailPage;
