import { useState, useEffect } from 'react';
import { 
  TextInput, 
  TextArea, 
  Button, 
  Loading, 
  InlineNotification,
  Tile,
  Tag
} from '@carbon/react';
import { Send, CheckmarkFilled } from '@carbon/icons-react';
import type { ContestQuestion } from '../services/api';
import { mockContestService } from '../services/mockContestData';

interface ContestQuestionListProps {
  contestId: string;
  problemId?: string;
  isTeacherOrAdmin?: boolean;
}

const ContestQuestionList = ({ contestId, problemId, isTeacherOrAdmin = false }: ContestQuestionListProps) => {
  const [questions, setQuestions] = useState<ContestQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newQuestionTitle, setNewQuestionTitle] = useState('');
  const [newQuestionContent, setNewQuestionContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      // Use mock service for now as backend might not be ready
      const data = await mockContestService.getContestQuestions(contestId);
      // Filter by problemId if provided, otherwise show all contest questions
      const filtered = problemId 
        ? data.filter(q => q.problem_id === problemId)
        : data;
      setQuestions(filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    } catch (err) {
      console.error(err);
      setError('無法載入提問列表');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
    // Poll for new questions every 30 seconds
    const interval = setInterval(fetchQuestions, 30000);
    return () => clearInterval(interval);
  }, [contestId, problemId]);

  const handleAskQuestion = async () => {
    if (!newQuestionTitle.trim() || !newQuestionContent.trim()) return;

    try {
      setSubmitting(true);
      await mockContestService.createContestQuestion(contestId, {
        title: newQuestionTitle,
        content: newQuestionContent,
        problemId
      });
      setNewQuestionTitle('');
      setNewQuestionContent('');
      await fetchQuestions();
    } catch (err) {
      console.error(err);
      setError('提問失敗');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async (questionId: string) => {
    const content = replyContent[questionId];
    if (!content?.trim()) return;

    try {
      setSubmitting(true);
      await mockContestService.answerContestQuestion(contestId, questionId, content);
      setReplyContent(prev => ({ ...prev, [questionId]: '' }));
      setReplyingTo(null);
      await fetchQuestions();
    } catch (err) {
      console.error(err);
      setError('回覆失敗');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && questions.length === 0) return <Loading withOverlay={false} />;

  return (
    <div className="contest-question-list">
      {error && (
        <InlineNotification
          kind="error"
          title="錯誤"
          subtitle={error}
          onClose={() => setError(null)}
        />
      )}

      {/* Ask Question Form */}
      <Tile className="ask-question-form" style={{ marginBottom: '2rem' }}>
        <h4 style={{ marginBottom: '1rem' }}>提問</h4>
        <TextInput
          id="question-title"
          labelText="標題"
          placeholder="請輸入問題摘要"
          value={newQuestionTitle}
          onChange={(e) => setNewQuestionTitle(e.target.value)}
          style={{ marginBottom: '1rem' }}
        />
        <TextArea
          id="question-content"
          labelText="內容"
          placeholder="請詳細描述您的問題"
          value={newQuestionContent}
          onChange={(e) => setNewQuestionContent(e.target.value)}
          style={{ marginBottom: '1rem' }}
        />
        <Button
          renderIcon={Send}
          onClick={handleAskQuestion}
          disabled={submitting || !newQuestionTitle.trim() || !newQuestionContent.trim()}
        >
          送出提問
        </Button>
      </Tile>

      {/* Questions List */}
      <div className="questions-list">
        <h4 style={{ marginBottom: '1rem' }}>
          問題列表 ({questions.length})
        </h4>
        
        {questions.length === 0 ? (
          <p style={{ color: 'var(--cds-text-secondary)' }}>尚無提問</p>
        ) : (
          questions.map(question => (
            <Tile key={question.id} style={{ marginBottom: '1rem', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <h5 style={{ fontWeight: 'bold' }}>{question.title}</h5>
                <span style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                  {new Date(question.created_at).toLocaleString()}
                </span>
              </div>
              
              <p style={{ marginBottom: '1rem', whiteSpace: 'pre-wrap' }}>{question.content}</p>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <Tag type="gray" size="sm">
                  {question.student_name}
                </Tag>
                {question.answer ? (
                  <Tag type="green" size="sm">已回覆</Tag>
                ) : (
                  <Tag type="red" size="sm">待回覆</Tag>
                )}
              </div>

              {/* Answer Section */}
              {question.answer && (
                <div style={{ 
                  backgroundColor: 'var(--cds-layer-02)', 
                  padding: '1rem', 
                  borderLeft: '4px solid var(--cds-support-success)',
                  marginTop: '1rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <CheckmarkFilled color="var(--cds-support-success)" />
                    <strong>助教回覆 ({question.answered_by})</strong>
                  </div>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{question.answer}</p>
                </div>
              )}

              {/* Reply Form (Teacher Only) */}
              {isTeacherOrAdmin && !question.answer && (
                <div style={{ marginTop: '1rem' }}>
                  {replyingTo === question.id ? (
                    <div>
                      <TextArea
                        labelText="回覆內容"
                        value={replyContent[question.id] || ''}
                        onChange={(e) => setReplyContent(prev => ({ ...prev, [question.id]: e.target.value }))}
                        style={{ marginBottom: '0.5rem' }}
                      />
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Button 
                          size="sm" 
                          onClick={() => handleReply(question.id)}
                          disabled={submitting}
                        >
                          送出回覆
                        </Button>
                        <Button 
                          size="sm" 
                          kind="ghost" 
                          onClick={() => setReplyingTo(null)}
                        >
                          取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button 
                      size="sm" 
                      kind="tertiary" 
                      onClick={() => setReplyingTo(question.id)}
                    >
                      回覆
                    </Button>
                  )}
                </div>
              )}
            </Tile>
          ))
        )}
      </div>
    </div>
  );
};

export default ContestQuestionList;
