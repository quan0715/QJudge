import React from 'react';
import { Modal, Tag, InlineLoading } from '@carbon/react';

interface Submission {
  id: number;
  status: string;
  score: number;
  exec_time: number;
  memory_usage: number;
  error_message?: string;
}

interface TestSubmissionResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  submission: Submission | null;
  isLoading: boolean;
}

const TestSubmissionResultModal: React.FC<TestSubmissionResultModalProps> = ({
  isOpen,
  onClose,
  submission,
  isLoading,
}) => {
  if (!isOpen) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'AC': return 'green';
      case 'WA': return 'red';
      case 'TLE': return 'magenta';
      case 'MLE': return 'magenta';
      case 'RE': return 'red';
      case 'CE': return 'gray';
      default: return 'gray';
    }
  };

  return (
    <Modal
      open={isOpen}
      modalHeading="測試提交結果"
      passiveModal
      onRequestClose={onClose}
      size="lg"
    >
      {isLoading ? (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <InlineLoading description="正在評測中..." />
        </div>
      ) : submission ? (
        <div className="test-result-container">
          <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Tag type={getStatusColor(submission.status)} size="lg">
              {submission.status}
            </Tag>
            <span style={{ fontSize: '1.25rem', fontWeight: 600 }}>
              分數: {submission.score}
            </span>
            <span style={{ color: '#8d8d8d' }}>
              時間: {submission.exec_time}ms | 記憶體: {submission.memory_usage}KB
            </span>
          </div>

          {submission.error_message && (
            <div style={{ 
              backgroundColor: '#fff0f0', 
              padding: '1rem', 
              borderLeft: '4px solid #da1e28',
              marginBottom: '1.5rem',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap'
            }}>
              <strong>錯誤訊息:</strong>
              <br />
              {submission.error_message}
            </div>
          )}

          {/* Test Case Results would go here if we had detailed test case info in the submission object immediately */}
          {/* For now, we show the summary */}
          
          <div style={{ marginTop: '1rem' }}>
            <p>測試提交僅評測公開測資。如需完整評測，請使用「正式提交」。</p>
          </div>
        </div>
      ) : (
        <div>無法取得評測結果</div>
      )}
    </Modal>
  );
};

export default TestSubmissionResultModal;
