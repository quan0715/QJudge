import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ProblemForm from '../components/ProblemForm';
import type { ProblemFormData } from '../components/ProblemForm';
import { authFetch } from '../services/auth';
const ProblemFormPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [initialData, setInitialData] = useState<Partial<ProblemFormData> | undefined>(undefined);

  useEffect(() => {
    if (isEditMode) {
      loadProblem();
    }
  }, [id]);

  const loadProblem = async () => {
    try {
      const res = await authFetch(`/api/v1/problems/${id}/`);
      
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
      const url = isEditMode ? `/api/v1/problems/${id}/?scope=manage` : '/api/v1/problems/';
      const method = isEditMode ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (res.ok) {
        setSuccess(isEditMode ? '題目更新成功！' : '題目建立成功！');
        setTimeout(() => navigate('/admin/problems'), 1500);
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
      onCancel={() => navigate('/admin/problems')}
      isEditMode={isEditMode}
      loading={loading}
      error={error}
      success={success}
    />
  );
};

export default ProblemFormPage;
