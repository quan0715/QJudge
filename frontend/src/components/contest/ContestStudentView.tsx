import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Modal,
  TextInput,
  Tag,
  InlineNotification,
  Tabs,
  Tab,
  TabList,
  TabPanels,
  TabPanel
} from '@carbon/react';
import { Play } from '@carbon/icons-react';
import type { ContestDetail } from '@/models/contest';
import { api } from '@/services/api';
import ContestProblemsList from './ContestProblemsList';
import ContestScoreboard from './ContestScoreboard';
import ContestClarifications from './ContestClarifications';
import { createExamHandlers } from './ExamModeWrapper';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';
import 'github-markdown-css/github-markdown.css';

interface ContestStudentViewProps {
  contest: ContestDetail;
  onRefresh: () => void;
}

const ContestStudentView: React.FC<ContestStudentViewProps> = ({ contest, onRefresh }) => {
  const navigate = useNavigate();
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState('');

  const [startModalOpen, setStartModalOpen] = useState(false);
  const [endModalOpen, setEndModalOpen] = useState(false);

  const [scoreboardData, setScoreboardData] = useState<any>(null);
  const [scoreboardLoading, setScoreboardLoading] = useState(false);
  const [scoreboardError, setScoreboardError] = useState('');

  const hasJoined = contest.has_joined || contest.is_registered;
  const hasStarted = contest.has_started;
  const hasFinished = contest.has_finished_exam;
  const isActive = contest.status === 'active';
  const canViewScoreboard = contest.permissions.can_view_full_scoreboard;

  const handleRegister = async () => {
    setRegistering(true);
    setError('');

    try {
      await api.registerContest(contest.id, password || undefined);
      setRegisterModalOpen(false);
      setPassword('');
      onRefresh();
    } catch (err: any) {
      setError(err.message || '註冊失敗');
    } finally {
      setRegistering(false);
    }
  };

  const handleStartExam = async () => {
    const { startExam } = createExamHandlers(contest.id, contest.exam_mode_enabled, onRefresh);
    const success = await startExam();
    
    if (success) {
      setStartModalOpen(false);
      // Navigate to first problem or reload
      if (contest.problems && contest.problems.length > 0) {
        // Preserve current query params (e.g. ?view=student)
        const searchParams = new URLSearchParams(window.location.search);
        navigate({
          pathname: `/contests/${contest.id}/problems/${contest.problems[0].problem_id}`,
          search: searchParams.toString()
        });
      }
    } else {
      alert('無法開始考試，請稍後再試');
    }
  };

  const handleEndExam = async () => {
    const { endExam } = createExamHandlers(contest.id, contest.exam_mode_enabled, onRefresh);
    const success = await endExam();
    
    if (success) {
      setEndModalOpen(false);
    } else {
      alert('無法結束考試，請稍後再試');
    }
  };

  const loadScoreboard = async () => {
    setScoreboardLoading(true);
    setScoreboardError('');
    
    try {
      const data = await api.getScoreboard(contest.id);
      setScoreboardData(data);
    } catch (err: any) {
      setScoreboardError(err.message || '無法載入成績排行榜');
    } finally {
      setScoreboardLoading(false);
    }
  };

  // Registration UI (Contest Overview)
  if (!hasJoined) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ 
          backgroundColor: 'var(--cds-layer-01)', 
          borderBottom: '1px solid var(--cds-border-subtle-01)',
          padding: '4rem 4rem'
        }}>
          <div className="cds--grid cds--grid--full-width">
            <div className="cds--row">
              <div className="cds--col-lg-16">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <Tag type={contest.visibility === 'private' ? 'purple' : 'teal'}>
                      {contest.visibility === 'private' ? '私有競賽' : '公開競賽'}
                    </Tag>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: 400, margin: '1rem 0' }}>
                      {contest.name}
                    </h1>
                    <div style={{ display: 'flex', gap: '2rem', color: 'var(--cds-text-secondary)' }}>
                      <div>
                        <span style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>開始時間</span>
                        <span style={{ fontFamily: 'monospace' }}>{new Date(contest.start_time).toLocaleString()}</span>
                      </div>
                      <div>
                        <span style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>結束時間</span>
                        <span style={{ fontFamily: 'monospace' }}>{new Date(contest.end_time).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ width: '300px' }}>
                    <Button 
                      onClick={() => setRegisterModalOpen(true)} 
                      size="xl" 
                      style={{ width: '100%', maxWidth: '100%' }}
                      renderIcon={Play}
                    >
                      報名參加
                    </Button>
                    {contest.visibility === 'private' && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--cds-text-secondary)', textAlign: 'center' }}>
                        此競賽需要密碼
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Body Section - Gray Background (Default Layer 01) */}
        <div className="cds--grid cds--grid--full-width" style={{ padding: '2rem 0', flex: 1 }}>
          <div className="cds--row">
            <div className="cds--col-lg-16">
              <div style={{ marginBottom: '1px', padding: '2rem', backgroundColor: 'var(--cds-ui-background)', border: '1px solid var(--cds-border-subtle-01)' }}>
                <h3 style={{ marginBottom: '1.5rem' }}>競賽敘述</h3>
                <div className="markdown-body" style={{ backgroundColor: 'transparent', fontSize: '1rem' }}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex, rehypeHighlight]}
                  >
                    {contest.description || '*(此競賽沒有敘述)*'}
                  </ReactMarkdown>
                </div>
              </div>
              
              <div style={{ padding: '2rem', backgroundColor: 'var(--cds-ui-background)', border: '1px solid var(--cds-border-subtle-01)' }}>
                <h3 style={{ marginBottom: '1.5rem' }}>競賽規則</h3>
                <div className="markdown-body" style={{ backgroundColor: 'transparent', fontSize: '1rem' }}>
                  {contest.rules ? (
                     <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex, rehypeHighlight]}
                    >
                      {contest.rules}
                    </ReactMarkdown>
                  ) : (
                    <ul style={{ paddingLeft: '1.5rem', lineHeight: '1.8' }}>
                      <li>請遵守學術誠信，獨立完成作答。</li>
                      <li>競賽期間禁止與他人討論題目。</li>
                      {contest.exam_mode_enabled && (
                        <li style={{ color: 'var(--cds-support-error)', fontWeight: 'bold' }}>
                          此競賽啟用考試模式，開始作答後將進入全螢幕，切換分頁或離開視窗將被記錄。
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <Modal
          open={registerModalOpen}
          modalHeading="加入競賽"
          primaryButtonText="確認加入"
          secondaryButtonText="取消"
          onRequestClose={() => setRegisterModalOpen(false)}
          onRequestSubmit={handleRegister}
          primaryButtonDisabled={registering}
        >
          <div style={{ marginBottom: '1rem' }}>
            <p>確定要加入 <strong>{contest.name}</strong> 嗎？</p>
          </div>

          {contest.visibility === 'private' && (
            <TextInput
              id="contest-password"
              labelText="競賽密碼"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="輸入競賽密碼"
            />
          )}

          {error && (
            <InlineNotification
              kind="error"
              title="錯誤"
              subtitle={error}
              lowContrast
              style={{ marginTop: '1rem' }}
            />
          )}
        </Modal>
      </div>
    );
  }

  // Not started yet
  if (!isActive && !hasFinished) {
    return (
      <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--cds-ui-background)', border: '1px solid var(--cds-border-subtle-01)' }}>
          <Tag type="gray" size="lg">尚未開始</Tag>
          <h2 style={{ margin: '1rem 0' }}>競賽尚未開始</h2>
          <p style={{ color: 'var(--cds-text-secondary)' }}>
            開始時間: {new Date(contest.start_time).toLocaleString()}
          </p>
        </div>
      </div>
    );
  }

  // Main student view (during or after contest)
  return (
    <div>
      {/* Hero Section */}
      <div style={{ 
        margin: '0 auto',
        backgroundColor: 'var(--cds-layer-01)', 
        borderBottom: '1px solid var(--cds-border-tile)',
        padding: '4rem 4rem'
      }}>
        <div className="cds--grid cds--grid--full-width">
          <div className="cds--row">
            <div className="cds--col-lg-12">
              <Tag type={contest.visibility === 'private' ? 'purple' : 'teal'} style={{ marginBottom: '1rem' }}>
                {contest.visibility === 'private' ? '私有競賽' : '公開競賽'}
              </Tag>
              <h1 style={{ fontSize: '2.5rem', fontWeight: 400, margin: '0 0 1rem' }}>
                {contest.name}
              </h1>
              <div style={{ display: 'flex', gap: '2rem', color: 'var(--cds-text-secondary)', marginBottom: '1rem' }}>
                <div>
                  <span style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>開始時間</span>
                  <span style={{ fontFamily: 'monospace' }}>{new Date(contest.start_time).toLocaleString()}</span>
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>結束時間</span>
                  <span style={{ fontFamily: 'monospace' }}>{new Date(contest.end_time).toLocaleString()}</span>
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>題目數量</span>
                  <span style={{ fontFamily: 'monospace' }}>{contest.problems?.length || 0}</span>
                </div>
              </div>
              {contest.description && (
                <div className="markdown-body" style={{ 
                  backgroundColor: 'transparent', 
                  fontSize: '0.95rem',
                  maxHeight: '120px',
                  overflow: 'hidden',
                  position: 'relative',
                  color: 'var(--cds-text-secondary)'
                }}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex, rehypeHighlight]}
                  >
                    {contest.description.substring(0, 200) + (contest.description.length > 200 ? '...' : '')}
                  </ReactMarkdown>
                </div>
              )}
            </div>
            <div className="cds--col-lg-4">
              <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column', alignItems: 'flex-end' }}>
                {isActive && hasStarted && !hasFinished && (
                  <Tag type="blue" size="lg">
                    考試進行中
                  </Tag>
                )}

                {/* Show Start button if not finished OR if multiple joins allowed */}
                {isActive && (!hasFinished || contest.allow_multiple_joins) && (!hasStarted || hasFinished) && (
                  <Button
                    renderIcon={Play}
                    size="xl"
                    onClick={() => setStartModalOpen(true)}
                    style={{ width: '100%', maxWidth: '280px' }}
                  >
                    {hasFinished ? '再次進入競賽' : '開始競賽'}
                  </Button>
                )}
                {hasFinished && !contest.allow_multiple_joins && (
                  <Tag type="green" size="lg">
                    ✓ 已完成
                  </Tag>
                )}
                {!isActive && (
                  <Tag type="gray" size="lg">
                    競賽已結束
                  </Tag>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        {hasFinished && (
          <InlineNotification
            kind="success"
            title="已完成"
            subtitle="您已完成本次競賽"
            lowContrast
            style={{ marginBottom: '1rem' }}
          />
        )}

        {!isActive && hasFinished && (
          <InlineNotification
            kind="info"
            title="競賽已結束"
            subtitle="競賽已結束，您可以查看成績與自己的提交記錄"
            lowContrast
            style={{ marginBottom: '1rem' }}
          />
        )}

      <Tabs>
        <TabList aria-label="Contest student tabs">
          <Tab>題目列表</Tab>
          <Tab>我的繳交</Tab>
          <Tab>提問與討論</Tab>
          {canViewScoreboard && <Tab onClick={loadScoreboard}>成績排行榜</Tab>}
        </TabList>
        <TabPanels>
          <TabPanel>
            <div style={{ marginTop: '1rem' }}>
              <ContestProblemsList
                contestId={contest.id}
                problems={contest.problems}
                isTeacherView={false}
                canViewProblems={hasStarted || hasFinished}
              />
            </div>
          </TabPanel>
          
          <TabPanel>
            <div style={{ marginTop: '1rem' }}>
              <Button
                onClick={() => navigate(`/contests/${contest.id}/submissions`)}
              >
                查看我的所有繳交記錄
              </Button>
            </div>
          </TabPanel>

          <TabPanel>
            <div style={{ marginTop: '1rem' }}>
              <ContestClarifications
                contestId={contest.id}
                isTeacherOrAdmin={false}
                problems={contest.problems}
              />
            </div>
          </TabPanel>

          {canViewScoreboard && (
            <TabPanel>
              <div style={{ marginTop: '1rem' }}>
                {scoreboardLoading && <div>載入中...</div>}
                {scoreboardError && (
                  <InlineNotification
                    kind="error"
                    title="無法載入"
                    subtitle={scoreboardError}
                    lowContrast
                  />
                )}
                {scoreboardData && <ContestScoreboard data={scoreboardData} />}
              </div>
            </TabPanel>
          )}
        </TabPanels>
      </Tabs>
      </div>

      {/* Start Exam Confirmation Modal */}
      <Modal
        open={startModalOpen}
        danger={contest.exam_mode_enabled}
        modalHeading="開始競賽"
        primaryButtonText="確認開始"
        secondaryButtonText="取消"
        onRequestClose={() => setStartModalOpen(false)}
        onRequestSubmit={handleStartExam}
      >
        <div>
          <h4 style={{ marginBottom: '1rem' }}>準備開始競賽</h4>
          <p style={{ marginBottom: '1rem' }}>
            開始後即可查看題目並提交解答。
          </p>
          
          {contest.exam_mode_enabled && (
            <div style={{ 
              padding: '1rem', 
              backgroundColor: 'var(--cds-support-error-inverse)', 
              borderRadius: '4px',
              marginBottom: '1rem'
            }}>
              <h5 style={{ color: 'var(--cds-support-error)', marginBottom: '0.5rem' }}>
                ⚠️ 考試模式警告
              </h5>
              <ul style={{ paddingLeft: '1.5rem', color: 'var(--cds-text-primary)' }}>
                <li>開始後將進入全螢幕模式</li>
                <li>切換分頁、離開視窗、退出全螢幕將被記錄</li>
                <li>違規行為可能導致作答被鎖定</li>
                <li>請確保在穩定的環境中作答</li>
              </ul>
            </div>
          )}

          <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
            請確認已準備就緒再開始競賽。
          </p>
        </div>
      </Modal>

      {/* End Exam Confirmation Modal */}
      <Modal
        open={endModalOpen}
        danger
        modalHeading="結束競賽"
        primaryButtonText="確認結束"
        secondaryButtonText="取消"
        onRequestClose={() => setEndModalOpen(false)}
        onRequestSubmit={handleEndExam}
      >
        <p>
          確定要結束競賽嗎？結束後將無法再提交新的解答。
        </p>
      </Modal>
    </div>
  );
};

export default ContestStudentView;
