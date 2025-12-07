import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ProblemForm from '@/domains/problem/components/ProblemForm';
import type { ProblemFormData } from '@/domains/problem/components/ProblemForm';
import { getProblem, createProblem, updateProblem } from '@/services/problem';
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
      // id is string | undefined, but route exists only if id exists for edit
      const data = await getProblem(id!);
      if (data) {
        // Need to match ProblemFormData structure. 
        // Assuming data matches largely or ProblemForm handles it.
        // Step 397: setInitialData(data). 
        setInitialData(data as any);
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
      if (isEditMode) {
        await updateProblem(id!, data);
        setSuccess('題目更新成功！');
      } else {
        await createProblem(data);
        setSuccess('題目建立成功！');
      }
      setTimeout(() => navigate('/management/problems'), 1500);

    } catch (err: any) {
      setError(err.message || '操作失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProblemForm
      initialData={initialData}
      onSubmit={handleSubmit}
      onCancel={() => navigate('/management/problems')}
      isEditMode={isEditMode}
      loading={loading}
      error={error}
      success={success}
    />
  );
};

export default ProblemFormPage;
