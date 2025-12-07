import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, InlineNotification } from '@carbon/react';
import ProblemForm from './ProblemForm';
import type { ProblemFormData } from './ProblemForm';
import { createProblem } from '@/services/problem';

interface CreateProblemModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export const CreateProblemModal: React.FC<CreateProblemModalProps> = ({
  open,
  onClose,
  onCreated
}) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (data: ProblemFormData) => {
    setLoading(true);
    setError('');
    
    try {
      // Map Form Data (CamelCase) to API DTO (snake_case)
      const payload = {
        title: data.title,
        difficulty: data.difficulty,
        time_limit: data.timeLimit,
        memory_limit: data.memoryLimit,
        is_visible: data.isVisible,
        translations: data.translations.map(t => ({
          language: t.language,
          title: t.title,
          description: t.description,
          input_description: t.inputDescription,
          output_description: t.outputDescription,
          hint: t.hint
        })),
        test_cases: data.testCases.map(tc => ({
          input_data: tc.input,
          output_data: tc.output,
          is_sample: tc.isSample,
          score: tc.score,
          order: tc.order,
          is_hidden: tc.isHidden
        })),
        language_configs: data.languageConfigs.map(lc => ({
          language: lc.language,
          template_code: lc.templateCode,
          is_enabled: lc.isEnabled,
          order: lc.order
        })),
        existing_tag_ids: data.existingTagIds,
        new_tag_names: data.newTagNames
      };

      const createdProblem = await createProblem(payload);
      setSuccess('題目建立成功！');
      
      setTimeout(() => {
        onClose();
        if (onCreated) {
          onCreated();
        }
        // Navigate to the created problem
        navigate(`/problems/${createdProblem.id}?tab=settings`);
      }, 1000);
    } catch (err: any) {
      setError(err.message || '建立失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setError('');
      setSuccess('');
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onRequestClose={handleClose}
      modalHeading="新增題目"
      passiveModal
      size="lg"
      style={{ maxHeight: '90vh' }}
    >
      <div style={{ maxHeight: 'calc(90vh - 100px)', overflowY: 'auto', padding: '1rem' }}>
        {error && (
          <InlineNotification
            kind="error"
            title="錯誤"
            subtitle={error}
            lowContrast
            style={{ marginBottom: '1rem' }}
          />
        )}
        {success && (
          <InlineNotification
            kind="success"
            title="成功"
            subtitle={success}
            lowContrast
            style={{ marginBottom: '1rem' }}
          />
        )}
        
        <ProblemForm
          onSubmit={handleSubmit}
          onCancel={handleClose}
          isEditMode={false}
          loading={loading}
        />
      </div>
    </Modal>
  );
};

export default CreateProblemModal;
