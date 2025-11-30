import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ProblemForm from '../components/ProblemForm';
import type { ProblemFormData } from '../components/ProblemForm';

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
      const token = localStorage.getItem('token');
      // Note: We might need a specific endpoint for contest problem details if permissions differ
      // But usually the problem ID is globally unique or we use the same endpoint
      const res = await fetch(`/api/v1/problems/${problemId}/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setInitialData(data);
      }
    } catch (err) {
      setError('Failed to load problem');
    }
  };

  const handleSubmit = async (data: ProblemFormData) => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      const url = `/api/v1/problems/${problemId}/`; // Always edit for now
      const method = 'PUT';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
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
    } catch (err) {
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
    />
  );
};

export default TeacherContestProblemEditPage;
