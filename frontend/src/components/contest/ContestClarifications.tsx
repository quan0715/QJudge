import { useState, useEffect } from 'react';
import {
  Tile,
  Button,
  Modal,
  TextArea,
  Checkbox,
  Tag,
  Select,
  SelectItem,
  TextInput
} from '@carbon/react';
import { Add, TrashCan, Bullhorn } from '@carbon/icons-react';
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
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [replyModalOpen, setReplyModalOpen] = useState(false);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  
  const [selectedClar, setSelectedClar] = useState<Clarification | null>(null);

  // Create Clarification state
  const [newContent, setNewContent] = useState('');
  const [newProblemId, setNewProblemId] = useState('');

  // Reply state
  const [replyText, setReplyText] = useState('');
  const [replyIsPublic, setReplyIsPublic] = useState(false);

  // Announcement state
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementContent, setAnnouncementContent] = useState('');

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [contestId]);

  const fetchData = async () => {
    try {
      const [clarData, annData] = await Promise.all([
        api.getClarifications(contestId),
        api.getContestAnnouncements(contestId)
      ]);

      // Handle clarifications
      if (clarData && typeof clarData === 'object' && 'results' in clarData) {
        setClarifications((clarData as any).results);
      } else if (Array.isArray(clarData)) {
        setClarifications(clarData as Clarification[]);
      } else {
        setClarifications([]);
      }

      // Handle announcements
      if (Array.isArray(annData)) {
        setAnnouncements(annData);
      } else {
        setAnnouncements([]);
      }
    } catch (error) {
      console.error('Failed to fetch data', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClarification = async () => {
    if (!newContent) return;

    try {
      await api.createClarification(contestId, {
        question: newContent,
        problem_id: newProblemId || undefined
      });
      setModalOpen(false);
      setNewContent('');
      setNewProblemId('');
      fetchData();
    } catch (error) {
      console.error('Failed to create clarification', error);
      alert('發布失敗，請檢查輸入內容');
    }
  };

  const handleCreateAnnouncement = async () => {
    if (!announcementTitle || !announcementContent) return;

    try {
      await api.createContestAnnouncement(contestId, {
        title: announcementTitle,
        content: announcementContent
      });
      setAnnouncementModalOpen(false);
      setAnnouncementTitle('');
      setAnnouncementContent('');
      fetchData();
    } catch (error) {
      console.error('Failed to create announcement', error);
      alert('發布公告失敗');
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
      fetchData();
    } catch (error) {
      console.error('Failed to reply to clarification', error);
    }
  };

  const handleDeleteClarification = async (clarId: number) => {
    if (!confirm('確定要刪除此提問？')) return;

    try {
      await api.deleteClarification(contestId, clarId.toString());
      fetchData();
    } catch (error) {
      console.error('Failed to delete clarification', error);
    }
  };

  const handleDeleteAnnouncement = async (annId: string) => {
    if (!confirm('確定要刪除此公告？')) return;
    try {
      await api.deleteContestAnnouncement(contestId, annId);
      fetchData();
    } catch (error) {
      console.error('Failed to delete announcement', error);
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
    <div className="contest-clarifications">
      {/* Announcements Section */}
      <section style={{ marginBottom: '4rem' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '1.5rem',
          borderBottom: '1px solid var(--cds-border-subtle)',
          paddingBottom: '1rem'
        }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0 }}>
            <Bullhorn size={24} /> 公告
          </h3>
          {isTeacherOrAdmin && (
            <Button
              renderIcon={Add}
              size="md"
              onClick={() => setAnnouncementModalOpen(true)}
            >
              發布公告
            </Button>
          )}
        </div>

        {announcements.length === 0 ? (
          <div style={{ 
            padding: '2rem', 
            textAlign: 'center', 
            backgroundColor: 'var(--cds-layer-01)', 
            color: 'var(--cds-text-secondary)' 
          }}>
            目前沒有任何公告
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {announcements.map((ann) => (
              <Tile key={ann.id} style={{ 
                borderLeft: '4px solid var(--cds-interactive-01)',
                backgroundColor: 'var(--cds-layer-01)',
                padding: '1.5rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <h4 style={{ margin: 0, fontSize: '1.25rem' }}>{ann.title}</h4>
                      {isTeacherOrAdmin && (
                        <Button
                          kind="ghost"
                          size="sm"
                          renderIcon={TrashCan}
                          hasIconOnly
                          iconDescription="刪除公告"
                          onClick={() => handleDeleteAnnouncement(ann.id)}
                          style={{ color: 'var(--cds-support-error)' }}
                        />
                      )}
                    </div>
                    <p style={{ 
                      whiteSpace: 'pre-wrap', 
                      marginBottom: '1rem', 
                      fontSize: '1rem', 
                      lineHeight: '1.5' 
                    }}>
                      {ann.content}
                    </p>
                    <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                      {ann.created_by?.username || 'Admin'} · {new Date(ann.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              </Tile>
            ))}
          </div>
        )}
      </section>

      {/* Q&A Section */}
      <section>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '1.5rem',
          borderBottom: '1px solid var(--cds-border-subtle)',
          paddingBottom: '1rem'
        }}>
          <h3 style={{ margin: 0 }}>學生提問與討論</h3>
          <Button
            renderIcon={Add}
            size="md"
            kind="tertiary"
            onClick={() => setModalOpen(true)}
          >
            提出問題
          </Button>
        </div>

        {clarifications.length === 0 ? (
          <div style={{ 
            padding: '2rem', 
            textAlign: 'center', 
            backgroundColor: 'var(--cds-layer-01)', 
            color: 'var(--cds-text-secondary)' 
          }}>
            目前還沒有任何提問
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {clarifications.map((clar) => (
              <Tile key={clar.id} style={{ padding: '0', overflow: 'hidden', border: '1px solid var(--cds-border-subtle)' }}>
                {/* Question Header */}
                <div style={{ 
                  padding: '1rem 1.5rem', 
                  backgroundColor: 'var(--cds-layer-01)',
                  borderBottom: '1px solid var(--cds-border-subtle)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                      <h4 style={{ margin: 0, marginRight: '0.5rem' }}>
                        {clar.question.length > 50 ? clar.question.substring(0, 50) + '...' : clar.question}
                      </h4>
                      {clar.problem_title && <Tag type="blue" size="sm">{clar.problem_title}</Tag>}
                      {clar.is_public ? (
                        <Tag type="green" size="sm">公開</Tag>
                      ) : (
                        <Tag type="gray" size="sm">私密</Tag>
                      )}
                      {clar.answer && <Tag type="purple" size="sm">已回覆</Tag>}
                    </div>
                    
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      {isTeacherOrAdmin && (
                        <>
                          <Button
                            kind="ghost"
                            size="sm"
                            onClick={() => openReplyModal(clar)}
                          >
                            回覆
                          </Button>
                          <Button
                            kind="ghost"
                            size="sm"
                            renderIcon={TrashCan}
                            hasIconOnly
                            iconDescription="刪除"
                            onClick={() => handleDeleteClarification(clar.id)}
                            style={{ color: 'var(--cds-support-error)' }}
                          />
                        </>
                      )}
                    </div>
                  </div>

                  <p style={{ whiteSpace: 'pre-wrap', marginBottom: '0.5rem', color: 'var(--cds-text-primary)' }}>
                    {clar.question}
                  </p>
                  
                  <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                    提問者: {clar.author_username} · {new Date(clar.created_at).toLocaleString()}
                  </div>
                </div>

                {/* Answer Section */}
                {clar.answer && (
                  <div style={{ 
                    padding: '1rem 1.5rem', 
                    backgroundColor: 'var(--cds-layer-02)', // Slightly darker/different background for answer
                  }}>
                    <div style={{ 
                      fontWeight: 'bold', 
                      marginBottom: '0.5rem', 
                      display: 'flex', 
                      gap: '0.5rem', 
                      alignItems: 'center',
                      color: 'var(--cds-text-primary)'
                    }}>
                      <span>回覆:</span>
                      {clar.is_public ? (
                        <Tag type="green" size="sm">公開回覆</Tag>
                      ) : (
                        <Tag type="gray" size="sm">僅提問者可見</Tag>
                      )}
                    </div>
                    <p style={{ whiteSpace: 'pre-wrap', marginBottom: '0.5rem', color: 'var(--cds-text-primary)' }}>
                      {clar.answer}
                    </p>
                    {clar.answered_by && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                        回覆者: {clar.answered_by}
                      </div>
                    )}
                  </div>
                )}
              </Tile>
            ))}
          </div>
        )}
      </section>

      {/* Create Clarification Modal */}
      <Modal
        open={modalOpen}
        modalHeading="提出問題"
        primaryButtonText="送出"
        secondaryButtonText="取消"
        onRequestClose={() => setModalOpen(false)}
        onRequestSubmit={handleCreateClarification}
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
            <SelectItem value="" text="一般提問" />
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

      {/* Create Announcement Modal */}
      <Modal
        open={announcementModalOpen}
        modalHeading="發布公告"
        primaryButtonText="發布"
        secondaryButtonText="取消"
        onRequestClose={() => setAnnouncementModalOpen(false)}
        onRequestSubmit={handleCreateAnnouncement}
      >
        <div style={{ marginBottom: '1rem' }}>
          <TextInput
            id="ann-title"
            labelText="公告標題"
            value={announcementTitle}
            onChange={(e) => setAnnouncementTitle(e.target.value)}
            placeholder="輸入標題..."
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <TextArea
            id="ann-content"
            labelText="公告內容"
            value={announcementContent}
            onChange={(e) => setAnnouncementContent(e.target.value)}
            placeholder="輸入內容..."
            rows={5}
          />
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
