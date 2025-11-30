import { useState } from 'react';
import { Modal, Button } from '@carbon/react';
import { api } from '../services/api';
import type { Contest } from '../services/api';

interface EndContestButtonProps {
  contest: Contest;
  onContestEnded: () => void;
}

/**
 * Button and confirmation dialog for ending a contest.
 * Only shown to contest creator or admin.
 */
export const EndContestButton: React.FC<EndContestButtonProps> = ({ contest, onContestEnded }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEndContest = async () => {
    setLoading(true);
    setError('');
    
    try {
      await api.endContest(contest.id);
      setModalOpen(false);
      onContestEnded();
    } catch (err: any) {
      setError(err.message || '結束競賽失敗');
    } finally {
      setLoading(false);
    }
  };

  // Don't show if already ended
  if (contest.is_ended) {
    return null;
  }

  return (
    <>
      <Button
        kind="danger"
        onClick={() => setModalOpen(true)}
      >
        結束競賽
      </Button>

      <Modal
        open={modalOpen}
        modalHeading="確認結束競賽"
        primaryButtonText={loading ? '處理中...' : '確認結束'}
        secondaryButtonText="取消"
        onRequestClose={() => setModalOpen(false)}
        onRequestSubmit={handleEndContest}
        danger
        primaryButtonDisabled={loading}
      >
        <div style={{ fontSize: '1rem', lineHeight: '1.6' }}>
          <p style={{ marginBottom: '1rem', fontWeight: 'bold' }}>
            您即將結束競賽：{contest.title}
          </p>
          
          <p style={{ marginBottom: '0.5rem' }}>請注意：</p>
          <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1rem' }}>
            <li>結束競賽後，您才能將比賽題目加入練習題庫。</li>
            <li>此操作不可逆，請確認比賽已經正式結束。</li>
            <li>結束比賽不會影響已有的提交記錄和成績。</li>
          </ul>

          {error && (
            <p style={{ color: 'red', marginTop: '1rem' }}>{error}</p>
          )}
          
          <p style={{ fontWeight: 'bold', marginTop: '1rem' }}>
            確定要結束此競賽嗎？
          </p>
        </div>
      </Modal>
    </>
  );
};
