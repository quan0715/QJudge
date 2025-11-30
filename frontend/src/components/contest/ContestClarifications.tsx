import { useState, useEffect } from 'react';
import {
  Tile,
  Button,
  Modal,
  TextArea,
  Checkbox,
  Tag,
  InlineNotification,
  Select,
  SelectItem
} from '@carbon/react';
import { Add, TrashCan } from '@carbon/icons-react';
import type { Clarification, ContestProblemSummary } from '@/models/contest';
import { api } from '@/services/api';

interface ContestClarificationsProps {
  contestId: string;
  isTeacherOrAdmin: boolean;
  problems?: ContestProblemSummary[];
}

const ContestClarifications: React.FC<ContestClarificationsProps> = ({
  contestId,
  isTeacherOrAdmin,
  problems = []
}) => {
  const [clarifications, setClarifications] = useState<Clarification[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [replyModalOpen, setReplyModalOpen] = useState(false);
  const [selectedClar, setSelectedClar] = useState<Clarification | null>(null);

  // Create modal state
  const [newContent, setNewContent] = useState('');
  const [newProblemId, setNewProblemId] = useState('');

  // Reply modal state
  const [replyText, setReplyText] = useState('');
  const [replyIsPublic, setReplyIsPublic] = useState(false);

  useEffect(() => {
    fetchClarifications();
    const interval = setInterval(fetchClarifications, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [contestId]);

  const fetchClarifications = async () => {
    try {
      const data = await api.getClarifications(contestId);
      // Handle both paginated and non-paginated responses
      if (data && typeof data === 'object' && 'results' in data) {
        setClarifications(data.results);
      } else if (Array.isArray(data)) {
        setClarifications(data);
      } else {
        setClarifications([]);
      }
    } catch (error) {
      console.error('Failed to fetch clarifications', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newContent) return;

    try {
      await api.createClarification(contestId, {
        question: newContent,
        problem_id: newProblemId || undefined
      });
      setModalOpen(false);
      setNewContent('');
      setNewProblemId('');
      fetchClarifications();
    } catch (error) {
      console.error('Failed to create clarification', error);
      alert('發布失敗，請檢查輸入內容');
    }
  };

  const handleReply = async () => {
    if (!selectedClar || !replyText) return;

    try {
      await api.replyClarification(contestId, selectedClar.id.toString(), replyText, replyIsPublic);
      setReplyModalOpen(false);
      setReplyText('');
      setReplyIsPublic(false);
      setSelectedClar(null);
      fetchClarifications();
    } catch (error) {
      console.error('Failed to reply to clarification', error);
    }
  };

  const handleDelete = async (clarId: number) => {
    if (!confirm('確定要刪除此提問？')) return;

    try {
      await api.deleteClarification(contestId, clarId.toString());
      fetchClarifications();
    } catch (error) {
      console.error('Failed to delete clarification', error);
    }
  };

  const openReplyModal = (clar: Clarification) => {
    setSelectedClar(clar);
    setReplyText(clar.answer || '');
    setReplyIsPublic(clar.is_public);
    setReplyModalOpen(true);
  };

  if (loading) {
    return <div>載入中...</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>提問與討論</h3>
        <Button
          renderIcon={Add}
          size="sm"
          onClick={() => setModalOpen(true)}
        >
          {isTeacherOrAdmin ? '新增公告' : '提出問題'}
        </Button>
      </div>

      {clarifications.length === 0 && (
        <InlineNotification
          kind="info"
          title="暫無提問"
          subtitle="目前還沒有任何提問或公告"
          lowContrast
        />
      )}

      {clarifications.map((clar) => (
        <Tile key={clar.id} style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <h4 style={{ margin: 0 }}>
                {clar.question.length > 50 ? clar.question.substring(0, 50) + '...' : clar.question}
              </h4>
              {clar.problem_title && <Tag type="blue" size="sm">{clar.problem_title}</Tag>}
              {clar.is_public && <Tag type="green" size="sm">公開</Tag>}
              {clar.answer && <Tag type="purple" size="sm">已回覆</Tag>}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {isTeacherOrAdmin && (
                <>
                  <Button
                    kind="tertiary"
                    size="sm"
                    onClick={() => openReplyModal(clar)}
                  >
                    回覆
                  </Button>
                  <Button
                    kind="danger--ghost"
                    size="sm"
                    renderIcon={TrashCan}
                    hasIconOnly
                    iconDescription="刪除"
                    onClick={() => handleDelete(clar.id)}
                  />
                </>
              )}
            </div>
          </div>

          <p style={{ whiteSpace: 'pre-wrap', marginBottom: '0.5rem' }}>{clar.question}</p>

          <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginBottom: '0.5rem' }}>
            提問者: {clar.author_username} · {new Date(clar.created_at).toLocaleString()}
          </div>

          {clar.answer && (
            <div style={{ 
              marginTop: '1rem', 
              paddingTop: '1rem', 
              borderTop: '1px solid var(--cds-border-subtle)' 
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span>回覆:</span>
                {clar.is_public ? (
                  <Tag type="green" size="sm">公開回覆</Tag>
                ) : (
                  <Tag type="gray" size="sm">僅提問者可見</Tag>
                )}
              </div>
              <p style={{ whiteSpace: 'pre-wrap', marginBottom: '0.5rem' }}>{clar.answer}</p>
              {clar.answered_by && (
                <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                  回覆者: {clar.answered_by}
                </div>
              )}
            </div>
          )}
        </Tile>
      ))}

      {/* Create Clarification Modal */}
      <Modal
        open={modalOpen}
        modalHeading={isTeacherOrAdmin ? '發布公告' : '提出問題'}
        primaryButtonText="送出"
        secondaryButtonText="取消"
        onRequestClose={() => setModalOpen(false)}
        onRequestSubmit={handleCreate}
      >
        <div style={{ marginBottom: '1rem' }}>
          <TextArea
            id="clar-question"
            labelText="問題內容"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="請清楚描述您的問題..."
            rows={5}
          />
        </div>
        <div>
          <Select
            id="clar-problem"
            labelText="相關題目（選填）"
            value={newProblemId}
            onChange={(e) => setNewProblemId(e.target.value)}
          >
            <SelectItem value="" text="一般提問 / 公告" />
            {problems.map(p => (
              <SelectItem 
                key={p.problem_id} 
                value={p.problem_id} 
                text={`${p.label}. ${p.title}`} 
              />
            ))}
          </Select>
        </div>
      </Modal>

      {/* Reply Modal */}
      <Modal
        open={replyModalOpen}
        modalHeading="回覆提問"
        primaryButtonText="送出回覆"
        secondaryButtonText="取消"
        onRequestClose={() => setReplyModalOpen(false)}
        onRequestSubmit={handleReply}
      >
        <div style={{ marginBottom: '1rem' }}>
          <TextArea
            id="reply-text"
            labelText="回覆內容"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="輸入回覆..."
            rows={5}
          />
        </div>
        <Checkbox
          id="reply-public"
          labelText="公開回覆（所有參賽者可見）"
          checked={replyIsPublic}
          onChange={(e) => setReplyIsPublic(e.target.checked)}
        />
      </Modal>
    </div>
  );
};

export default ContestClarifications;
