import { useState, useEffect } from 'react';
import {
  Button,
  Modal,
  TextArea,
  Checkbox,
  Tag,
  Select,
  SelectItem,
  TextInput
} from '@carbon/react';
import { TrashCan } from '@carbon/icons-react';
import type { Clarification, ContestProblemSummary, ContestAnnouncement } from '@/core/entities/contest.entity';
import { mapClarificationDto, mapContestAnnouncementDto } from '@/core/entities/mappers/contestMapper';
import { 
  getClarifications, 
  getContestAnnouncements, 
  createClarification, 
  createContestAnnouncement, 
  replyClarification, 
  deleteClarification,
  deleteContestAnnouncement
} from '@/services/contest';
import { Card } from '@/ui/components/Card';

interface ContestClarificationsProps {
  contestId: string;
  isTeacherOrAdmin: boolean;
  problems?: ContestProblemSummary[];
  contestStatus?: string;
}

const ContestClarifications: React.FC<ContestClarificationsProps> = ({
  contestId,
  isTeacherOrAdmin,
  problems = [],
  contestStatus = 'active'
}) => {
  const [clarifications, setClarifications] = useState<Clarification[]>([]);
  const [announcements, setAnnouncements] = useState<ContestAnnouncement[]>([]);
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

  // Error Modal State
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setErrorModalOpen(true);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [contestId]);

  const fetchData = async () => {
    try {
      const [clarData, annData] = await Promise.all([
        getClarifications(contestId),
        getContestAnnouncements(contestId)
      ]);

      // Handle clarifications
      let rawClars = [];
      if (clarData && typeof clarData === 'object' && 'results' in clarData) {
        rawClars = (clarData as any).results;
      } else if (Array.isArray(clarData)) {
        rawClars = clarData;
      }
      setClarifications(rawClars.map(mapClarificationDto));

      // Handle announcements
      let rawAnns = [];
      if (Array.isArray(annData)) {
        rawAnns = annData;
      }
      setAnnouncements(rawAnns.map(mapContestAnnouncementDto));

    } catch (error) {
      console.error('Failed to fetch data', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClarification = async () => {
    if (!newContent) return;

    try {
      await createClarification(contestId, {
        question: newContent,
        problem_id: newProblemId || undefined
      });
      setModalOpen(false);
      setNewContent('');
      setNewProblemId('');
      fetchData();
    } catch (error) {
      console.error('Failed to create clarification', error);
      showError('發布失敗，請檢查輸入內容');
    }
  };

  const handleCreateAnnouncement = async () => {
    if (!announcementTitle || !announcementContent) return;

    try {
      await createContestAnnouncement(contestId, {
        title: announcementTitle,
        content: announcementContent
      });
      setAnnouncementModalOpen(false);
      setAnnouncementTitle('');
      setAnnouncementContent('');
      fetchData();
    } catch (error) {
      console.error('Failed to create announcement', error);
      showError('發布公告失敗');
    }
  };

  const handleReply = async () => {
    if (!selectedClar || !replyText) return;

    try {
      await replyClarification(contestId, selectedClar.id, replyText, replyIsPublic);
      setReplyModalOpen(false);
      setReplyText('');
      setReplyIsPublic(false);
      setSelectedClar(null);
      fetchData();
    } catch (error) {
      console.error('Failed to reply to clarification', error);
    }
  };

  const handleDeleteClarification = async (clarId: string) => {
    if (!confirm('確定要刪除此提問？')) return;

    try {
      await deleteClarification(contestId, clarId);
      fetchData();
    } catch (error) {
      console.error('Failed to delete clarification', error);
    }
  };

  const handleDeleteAnnouncement = async (annId: string) => {
    if (!confirm('確定要刪除此公告？')) return;
    try {
      await deleteContestAnnouncement(contestId, annId);
      fetchData();
    } catch (error) {
      console.error('Failed to delete announcement', error);
    }
  };

  const openReplyModal = (clar: Clarification) => {
    setSelectedClar(clar);
    setReplyText(clar.answer || '');
    setReplyIsPublic(clar.isPublic);
    setReplyModalOpen(true);
  };

  if (loading) {
    return <div>載入中...</div>;
  }

  return (
    <div className="contest-clarifications">
      {/* Announcements Section */}
      <Card 
        title="公告" 
        action={isTeacherOrAdmin && contestStatus === 'active' ? {
          label: "發布公告",
          onClick: () => setAnnouncementModalOpen(true)
        } : undefined}
        style={{ marginBottom: '2rem' }}
      >
        {announcements.length === 0 ? (
          <div style={{ 
            padding: '2rem', 
            textAlign: 'center', 
            color: 'var(--cds-text-secondary)' 
          }}>
            目前沒有任何公告
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {announcements.map((ann) => (
              <div key={ann.id} style={{ 
                borderLeft: '4px solid var(--cds-interactive-01)',
                backgroundColor: 'var(--cds-layer-01)',
                padding: '1rem',
                marginBottom: '0.5rem',
                border: '1px solid var(--cds-border-subtle)',
                borderRadius: '4px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{ann.title}</h4>
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
                      marginBottom: '0.5rem', 
                      fontSize: '0.875rem', 
                      lineHeight: '1.5',
                      color: 'var(--cds-text-secondary)'
                    }}>
                      {ann.content}
                    </p>
                    <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                      {ann.createdBy} · {new Date(ann.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Q&A Section */}
      <Card 
        title="學生提問與討論"
        action={contestStatus === 'active' ? {
          label: "提出問題",
          onClick: () => setModalOpen(true)
        } : undefined}
      >
        {clarifications.length === 0 ? (
          <div style={{ 
            padding: '2rem', 
            textAlign: 'center', 
            color: 'var(--cds-text-secondary)' 
          }}>
            目前還沒有任何提問
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {clarifications.map((clar) => (
              <div key={clar.id} style={{ 
                border: '1px solid var(--cds-border-subtle)', 
                borderRadius: '4px',
                overflow: 'hidden' 
              }}>
                {/* Question Header */}
                <div style={{ 
                  padding: '1rem', 
                  backgroundColor: 'var(--cds-layer-01)',
                  borderBottom: clar.answer ? '1px solid var(--cds-border-subtle)' : 'none'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                      <h4 style={{ margin: 0, marginRight: '0.5rem', fontSize: '1rem', fontWeight: 600 }}>
                        {clar.question.length > 50 ? clar.question.substring(0, 50) + '...' : clar.question}
                      </h4>
                      {clar.problemTitle && <Tag type="blue" size="sm">{clar.problemTitle}</Tag>}
                      {clar.isPublic ? (
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

                  <p style={{ whiteSpace: 'pre-wrap', marginBottom: '0.5rem', color: 'var(--cds-text-primary)', fontSize: '0.875rem' }}>
                    {clar.question}
                  </p>
                  
                  <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                    提問者: {clar.authorUsername} · {new Date(clar.createdAt).toLocaleString()}
                  </div>
                </div>

                {/* Answer Section */}
                {clar.answer && (
                  <div style={{ 
                    padding: '1rem', 
                    backgroundColor: 'var(--cds-layer-02)', // Slightly darker/different background for answer
                  }}>
                    <div style={{ 
                      fontWeight: 'bold', 
                      marginBottom: '0.5rem', 
                      display: 'flex', 
                      gap: '0.5rem', 
                      alignItems: 'center',
                      color: 'var(--cds-text-primary)',
                      fontSize: '0.875rem'
                    }}>
                      <span>回覆:</span>
                      {clar.isPublic ? (
                        <Tag type="green" size="sm">公開回覆</Tag>
                      ) : (
                        <Tag type="gray" size="sm">僅提問者可見</Tag>
                      )}
                    </div>
                    <p style={{ whiteSpace: 'pre-wrap', marginBottom: '0.5rem', color: 'var(--cds-text-primary)', fontSize: '0.875rem' }}>
                      {clar.answer}
                    </p>
                    {clar.answeredBy && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                        回覆者: {clar.answeredBy}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>


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
                key={p.problemId} 
                value={p.problemId} 
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

      {/* Error Modal */}
      <Modal
        open={errorModalOpen}
        modalHeading="錯誤"
        passiveModal
        onRequestClose={() => setErrorModalOpen(false)}
      >
        <p>{errorMessage}</p>
      </Modal>
    </div>
  );
};

export default ContestClarifications;
