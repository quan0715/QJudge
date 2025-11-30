import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Tabs,
  Tab,
  TabList,
  TabPanels,
  TabPanel,
  Toggle,
  TextInput,
  TextArea,
  Tile,
  InlineNotification
} from '@carbon/react';
import { Add, PlayFilled, StopFilled, Export, Upload } from '@carbon/icons-react';
import type { ContestDetail } from '@/models/contest';
import { api } from '@/services/api';
import ContestProblemsList from './ContestProblemsList';
import ContestClarifications from './ContestClarifications';
import ExamEventStatsComponent from './ExamEventStats';
import ContestScoreboard from './ContestScoreboard';
import ProblemImportModal from '@/components/ProblemImportModal';

interface ContestTeacherViewProps {
  contest: ContestDetail;
  onRefresh: () => void;
}

const ContestTeacherView: React.FC<ContestTeacherViewProps> = ({ contest, onRefresh }) => {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Settings form state
  const [name, setName] = useState(contest.name);
  const [description, setDescription] = useState(contest.description || '');
  const [startTime, setStartTime] = useState((contest.start_time || '').slice(0, 16));
  const [endTime, setEndTime] = useState((contest.end_time || '').slice(0, 16));
  const [visibility, setVisibility] = useState<'public' | 'private'>(contest.visibility);
  const [password, setPassword] = useState(contest.password || '');
  const [examModeEnabled, setExamModeEnabled] = useState(contest.exam_mode_enabled);
  const [scoreboardVisible, setScoreboardVisible] = useState(contest.scoreboard_visible_during_contest);

  const [scoreboardData, setScoreboardData] = useState<any>(null);
  const [scoreboardLoading, setScoreboardLoading] = useState(false);

  const canEdit = contest.permissions.can_edit_contest;
  const canToggleStatus = contest.permissions.can_toggle_status;
  const canPublish = contest.permissions.can_publish_problems;

  const handleSaveSettings = async () => {
    setSaving(true);
    setError('');

    try {
      await api.updateContest(contest.id, {
        name,
        description,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        visibility,
        password: visibility === 'private' ? password : undefined,
        exam_mode_enabled: examModeEnabled,
        scoreboard_visible_during_contest: scoreboardVisible
      });
      
      alert('設定已儲存');
      onRefresh();
    } catch (err: any) {
      setError(err.message || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    const action = contest.status === 'active' ? '結束' : '啟用';
    if (!confirm(`確定要${action}競賽嗎？`)) return;

    try {
      // Assuming the backend has a toggle_status endpoint
      // You might need to adjust this based on actual backend implementation
      await api.updateContest(contest.id, {
        status: contest.status === 'active' ? 'inactive' : 'active'
      });
      onRefresh();
    } catch (err) {
      alert('操作失敗');
    }
  };

  const handleReorderProblem = async (problemId: string, direction: 'up' | 'down') => {
    // This would need backend support for reordering
    console.log('Reorder problem', problemId, direction);
    // TODO: Implement reordering API call
  };

  const handlePublishProblem = async (problemId: string) => {
    if (!confirm('確定要將此題目發布到練習題庫嗎？')) return;

    try {
      await api.publishProblemToPractice(contest.id, problemId);
      alert('題目已發布到練習題庫');
      onRefresh();
    } catch (err: any) {
      alert(err.message || '發布失敗');
    }
  };

  const loadScoreboard = async () => {
    setScoreboardLoading(true);
    try {
      const data = await api.getScoreboard(contest.id);
      setScoreboardData(data);
    } catch (err) {
      console.error('Failed to load scoreboard', err);
    } finally {
      setScoreboardLoading(false);
    }
  };

  const [importModalOpen, setImportModalOpen] = useState(false);

  const handleImportProblem = async (problemData: any) => {
    try {
      // Add contest_id to the problem data to link it directly
      const dataWithContest = {
        ...problemData,
        contest_id: contest.id
      };

      const res = await api.createContestProblem(contest.id, dataWithContest);
      
      // Refresh the contest data to show the new problem
      onRefresh();
      return res;
    } catch (error: any) {
      throw error;
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Status Controls */}
      {canToggleStatus && (
        <Tile style={{ marginBottom: '1rem', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h4>競賽狀態</h4>
              <p style={{ color: 'var(--cds-text-secondary)', margin: '0.5rem 0' }}>
                目前狀態: {contest.status === 'active' ? '進行中' : '未開始'}
              </p>
            </div>
            <Button
              kind={contest.status === 'active' ? 'danger' : 'primary'}
              renderIcon={contest.status === 'active' ? StopFilled : PlayFilled}
              onClick={handleToggleStatus}
            >
              {contest.status === 'active' ? '結束競賽' : '啟用競賽'}
            </Button>
          </div>
        </Tile>
      )}

      <Tabs>
        <TabList aria-label="Contest teacher tabs">
          <Tab>設定</Tab>
          <Tab>題目管理</Tab>
          <Tab>提問與討論</Tab>
          <Tab onClick={loadScoreboard}>成績排行榜</Tab>
          <Tab>考試事件</Tab>
          <Tab>繳交記錄</Tab>
        </TabList>

        <TabPanels>
          {/* Settings Tab */}
          <TabPanel>
            <div style={{ marginTop: '1rem' }}>
              {error && (
                <InlineNotification
                  kind="error"
                  title="錯誤"
                  subtitle={error}
                  onClose={() => setError('')}
                  style={{ marginBottom: '1rem' }}
                />
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                {/* Left column: Basic settings */}
                <div>
                  <h4 style={{ marginBottom: '1rem' }}>基本設定</h4>
                  
                  <div style={{ marginBottom: '1rem' }}>
                    <TextInput
                      id="name"
                      labelText="競賽名稱"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={!canEdit}
                    />
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <TextArea
                      id="description"
                      labelText="描述"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      disabled={!canEdit}
                      rows={4}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <label className="cds--label">開始時間</label>
                      <input
                        type="datetime-local"
                        className="cds--text-input"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        disabled={!canEdit}
                      />
                    </div>
                    <div>
                      <label className="cds--label">結束時間</label>
                      <input
                        type="datetime-local"
                        className="cds--text-input"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        disabled={!canEdit}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label className="cds--label">可見性</label>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                      <Button
                        kind={visibility === 'public' ? 'primary' : 'tertiary'}
                        size="sm"
                        onClick={() => setVisibility('public')}
                        disabled={!canEdit}
                      >
                        公開
                      </Button>
                      <Button
                        kind={visibility === 'private' ? 'primary' : 'tertiary'}
                        size="sm"
                        onClick={() => setVisibility('private')}
                        disabled={!canEdit}
                      >
                        私人
                      </Button>
                    </div>
                  </div>

                  {visibility === 'private' && (
                    <div style={{ marginBottom: '1rem' }}>
                      <form onSubmit={(e) => { e.preventDefault(); }}>
                        <TextInput
                          id="password"
                          labelText="競賽密碼"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          disabled={!canEdit}
                          autoComplete="new-password"
                        />
                      </form>
                    </div>
                  )}
                </div>

                {/* Right column: Exam & Scoreboard settings */}
                <div>
                  <h4 style={{ marginBottom: '1rem' }}>考試設定</h4>

                  <div style={{ marginBottom: '1.5rem' }}>
                    <Toggle
                      id="exam-mode"
                      labelText="啟用考試模式"
                      toggled={examModeEnabled}
                      onToggle={(checked) => setExamModeEnabled(checked)}
                      disabled={!canEdit}
                    />
                    <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginTop: '0.5rem' }}>
                      啟用後，學生開始作答時將進入全螢幕模式，並偵測切換分頁等違規行為
                    </p>
                  </div>

                  <div style={{ marginBottom: '1.5rem' }}>
                    <Toggle
                      id="scoreboard-visible"
                      labelText="比賽進行中顯示成績排行榜"
                      toggled={scoreboardVisible}
                      onToggle={(checked) => setScoreboardVisible(checked)}
                      disabled={!canEdit}
                    />
                    <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginTop: '0.5rem' }}>
                      關閉時，學生在比賽進行中無法查看完整排行榜，只能看到自己的成績
                    </p>
                  </div>

                  <Button
                    onClick={handleSaveSettings}
                    disabled={saving || !canEdit}
                  >
                    {saving ? '儲存中...' : '儲存設定'}
                  </Button>
                </div>
              </div>
            </div>
          </TabPanel>

          {/* Problem Management Tab */}
          <TabPanel>
            <div style={{ marginTop: '1rem' }}>
              <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
                <h4>題目管理</h4>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <Button
                    renderIcon={Upload}
                    kind="secondary"
                    size="sm"
                    onClick={() => setImportModalOpen(true)}
                  >
                    匯入 YAML
                  </Button>
                  <Button
                    renderIcon={Add}
                    size="sm"
                    onClick={() => navigate(`/teacher/contests/${contest.id}/problems/new`)}
                  >
                    新增題目
                  </Button>
                </div>
              </div>

              <ContestProblemsList
                contestId={contest.id}
                problems={contest.problems}
                isTeacherView={true}
                onReorder={handleReorderProblem}
                onPublish={canPublish ? handlePublishProblem : undefined}
                showPublishButton={canPublish && contest.status === 'inactive'}
              />
              
              <ProblemImportModal
                open={importModalOpen}
                onClose={() => setImportModalOpen(false)}
                onImport={handleImportProblem}
              />
            </div>
          </TabPanel>

          {/* Clarifications Tab */}
          <TabPanel>
            <div style={{ marginTop: '1rem' }}>
              <ContestClarifications
                contestId={contest.id}
                isTeacherOrAdmin={true}
                problems={contest.problems}
              />
            </div>
          </TabPanel>

          {/* Scoreboard Tab */}
          <TabPanel>
            <div style={{ marginTop: '1rem' }}>
              {scoreboardLoading && <div>載入中...</div>}
              {scoreboardData && <ContestScoreboard data={scoreboardData} />}
              {!scoreboardLoading && !scoreboardData && (
                <InlineNotification
                  kind="info"
                  title="尚未載入"
                  subtitle="點擊「成績排行榜」標籤載入資料"
                  lowContrast
                />
              )}
            </div>
          </TabPanel>

          {/* Exam Events Tab */}
          <TabPanel>
            <div style={{ marginTop: '1rem' }}>
              {examModeEnabled ? (
                <ExamEventStatsComponent contestId={contest.id} />
              ) : (
                <InlineNotification
                  kind="info"
                  title="考試模式未啟用"
                  subtitle="此競賽未啟用考試模式，無事件記錄"
                  lowContrast
                />
              )}
            </div>
          </TabPanel>

          {/* Submissions Tab */}
          <TabPanel>
            <div style={{ marginTop: '1rem' }}>
              <Button
                renderIcon={Export}
                onClick={() => navigate(`/contests/${contest.id}/submissions`)}
              >
                查看所有繳交記錄
              </Button>
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  );
};

export default ContestTeacherView;
