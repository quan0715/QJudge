import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loading } from '@carbon/react';
import ProblemSolver from '@/components/ProblemSolver';
import type { Problem, Submission } from '@/components/ProblemSolver';
import { authFetch } from '@/services/auth';

const ProblemDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProblem = async () => {
      if (!id) return;
        try {
          const res = await authFetch(`/api/v1/problems/${id}/`);
        
        if (!res.ok) throw new Error('Failed to fetch problem');
        
        const data = await res.json();
        setProblem(data);
      } catch (err) {
        setError('無法載入題目資料');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchProblem();
  }, [id]);

  const handleSubmit = async (code: string, language: string, isTest: boolean): Promise<Submission | void> => {
    if (!problem) return;

      const res = await authFetch('/api/v1/submissions/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
      body: JSON.stringify({
        problem: problem.id,
        language: language,
        code: code,
        is_test: isTest
      })
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.detail || '提交失敗，請稍後再試');
    }

    const response = await res.json();
    
    // Check for submission ID
    const submissionId = response.id || response.submission_id || response.data?.id;
    
    if (!submissionId) {
      throw new Error('提交成功但無法取得提交 ID');
    }

    if (isTest) {
      // Return the submission object for the component to handle polling
      return response;
    } else {
      // For official submission, redirect to submission detail
      setTimeout(() => {
        navigate(`/submissions/${submissionId}`);
      }, 100);
    }
  };

  if (loading) return <Loading />;
  if (error) return <div>{error}</div>;
  if (!problem) return <div>題目不存在</div>;

  return (
    <ProblemSolver
      problem={problem}
      onSubmit={handleSubmit}
      isContestMode={false}
    />
  );
};

export default ProblemDetailPage;
