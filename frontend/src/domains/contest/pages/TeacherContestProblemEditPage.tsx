import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ProblemForm from '@/domains/problem/components/ProblemForm';
import type { ProblemFormData } from '@/domains/problem/components/ProblemForm';
import { httpClient } from '@/services/api/httpClient';
import { getContestProblem } from '@/services/contest';
import { getProblem } from '@/services/problem';

const TeacherContestProblemEditPage = () => {
  const { contestId, problemId } = useParams<{ contestId: string; problemId: string }>();
  const navigate = useNavigate();
  const isEditMode = Boolean(problemId);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [initialData, setInitialData] = useState<ProblemFormData | null>(null);

  useEffect(() => {
    const loadProblem = async () => {
      if (!problemId) {
        setLoading(false);
        return;
      }
      
      try {
        let data;
        try {
          // Try to fetch as a regular problem first (if user has permission)
          data = await getProblem(problemId, 'manage');
        } catch (err) {
          // If failed, try to fetch as a contest problem
          if (contestId) {
            const contestProblem = await getContestProblem(contestId, problemId);
            if (contestProblem) {
              // If we found the problem via contest, it might have the real global ID
              // But for editing, we need the full data. 
              // If contestProblem has the full data, use it.
              if (contestProblem.id !== problemId) {
                data = await getProblem(contestProblem.id, 'manage');
              } else {
                data = contestProblem;
              }
            }
          }
        }

        if (data) {
          setInitialData(data as any);
        } else {
          setError('無法載入題目資料');
        }
      } catch {
        setError('Failed to load problem');
      } finally {
        setLoading(false);
      }
    };

    if (isEditMode) {
      loadProblem();
    }
  }, [contestId, problemId, isEditMode]);

  const handleSubmit = async (data: ProblemFormData) => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const url = `/api/v1/problems/${problemId}/?scope=manage`; // Always edit for now
      
      const res = await httpClient.put(url, data);

      if (res.ok) {
        setSuccess('題目更新成功！');
        setTimeout(() => navigate(`/teacher/contests/${contestId}/edit`), 1500);
      } else {
        const errorData = await res.json();
        setError(JSON.stringify(errorData) || '操作失敗');
      }
    } catch {
      setError('操作失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProblemForm
      initialData={initialData || undefined}
      onSubmit={handleSubmit}
      onCancel={() => navigate(`/teacher/contests/${contestId}/edit`)}
      isEditMode={isEditMode}
      isContestMode={true}
      loading={loading}
      error={error}
      success={success}
    />
  );
};

export default TeacherContestProblemEditPage;
