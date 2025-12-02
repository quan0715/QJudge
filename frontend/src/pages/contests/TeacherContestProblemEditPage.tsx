import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ProblemForm from '@/components/ProblemForm';
import type { ProblemFormData } from '@/components/ProblemForm';
import { authFetch } from '@/services/auth';
import { api } from '@/services/api';

const TeacherContestProblemEditPage = () => {
  const navigate = useNavigate();
  const { contestId, problemId } = useParams();
  const isEditMode = Boolean(problemId);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [initialData, setInitialData] = useState<Partial<ProblemFormData> | undefined>(undefined);

  useEffect(() => {
    if (isEditMode) {
      loadProblem();
    }
  }, [problemId]);

  const loadProblem = async () => {
    try {
      if (!problemId) return;
      
      // Try to fetch as a global problem first with 'manage' scope
      let data = await api.getProblem(problemId, 'manage');
      
      if (!data) {
        // If failed, try to fetch as a contest problem
        if (contestId) {
            const contestProblem = await api.getContestProblem(contestId, problemId);
            if (contestProblem && contestProblem.problem) {
                // If we found the problem via contest, it might have the real global ID
                // But for editing, we need the full data. 
                // If contestProblem.problem has the full data, use it.
                // Otherwise, try to fetch global problem using the ID from contestProblem
                if (contestProblem.problem.id !== problemId) {
                    data = await api.getProblem(contestProblem.problem.id, 'manage');
                } else {
                    data = contestProblem.problem;
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
    }
  };

  const handleSubmit = async (data: ProblemFormData) => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const url = `/api/v1/problems/${problemId}/?scope=manage`; // Always edit for now
      const method = 'PUT';

      const res = await authFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

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
      initialData={initialData}
      onSubmit={handleSubmit}
      onCancel={() => navigate(`/teacher/contests/${contestId}/edit`)}
      isEditMode={isEditMode}
      isContestMode={true}
      loading={loading}
      error={error}
      success={success}
      breadcrumbs={[
        { label: 'Contests', href: '/teacher/contests' },
        { label: 'Contest Settings', href: `/teacher/contests/${contestId}/edit` },
        { label: isEditMode ? 'Edit Problem' : 'New Problem' }
      ]}
    />
  );
};

export default TeacherContestProblemEditPage;
