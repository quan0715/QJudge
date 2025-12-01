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
  InlineNotification,
  Tag,
  Modal,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
} from '@carbon/react';
import { Add, PlayFilled, StopFilled, Upload, Unlocked } from '@carbon/icons-react';
import type { ContestDetail, ContestParticipant } from '@/models/contest';
import { api } from '@/services/api';
import ContestProblemsList from './ContestProblemsList';
import ContestClarifications from './ContestClarifications';
import ExamEventStatsComponent from './ExamEventStats';
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

  const [participants, setParticipants] = useState<ContestParticipant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);

  const loadParticipants = async () => {
    setParticipantsLoading(true);
    try {
      const data = await api.getContestParticipants(contest.id);
      setParticipants(data);
    } catch (err) {
      console.error('Failed to load participants', err);
      alert('無法載入參賽者列表');
    } finally {
      setParticipantsLoading(false);
    }
  };

  const handleUnlock = async (userId: number) => {
    if (!confirm('確定要解除此學生的鎖定嗎？')) return;
    try {
      await api.unlockParticipant(contest.id, userId);
      alert('已解除鎖定');
      loadParticipants();
    } catch (err) {
      alert('解除鎖定失敗');
    }
  };

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
      await api.toggleStatus(contest.id);
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

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<ContestParticipant | null>(null);
  const [editLockReason, setEditLockReason] = useState('');
  const [editIsLocked, setEditIsLocked] = useState(false);
  const [editHasFinished, setEditHasFinished] = useState(false);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addUsername, setAddUsername] = useState('');

  const handleEditClick = (p: ContestParticipant) => {
    setEditingParticipant(p);
    setEditLockReason(p.lock_reason || '');
    setEditIsLocked(p.is_locked);
    setEditHasFinished(p.has_finished_exam);
    setEditModalOpen(true);
  };

  const handleSaveParticipant = async () => {
    if (!editingParticipant) return;
    try {
      await api.updateParticipant(contest.id, editingParticipant.user_id, {
        is_locked: editIsLocked,
        lock_reason: editLockReason,
        has_finished_exam: editHasFinished
      });
      alert('更新成功');
      setEditModalOpen(false);
      loadParticipants();
    } catch (err) {
      alert('更新失敗');
    }
  };

  const handleAddParticipant = async () => {
    if (!addUsername) return;
    try {
      await api.addParticipant(contest.id, addUsername);
      alert('新增成功');
      setAddModalOpen(false);
      setAddUsername('');
      loadParticipants();
    } catch (err: any) {
      alert(err.message || '新增失敗');
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
          <Tab onClick={loadParticipants}>參賽者管理</Tab>
          <Tab>考試事件</Tab>
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

          {/* Participants Tab */}
          <TabPanel>
            <div style={{ marginTop: '1rem' }}>
              <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
                <h4>參賽者管理</h4>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <Button size="sm" kind="tertiary" onClick={loadParticipants}>
                    重新整理
                  </Button>
                  <Button size="sm" renderIcon={Add} onClick={() => setAddModalOpen(true)}>
                    新增參賽者
                  </Button>
                </div>
              </div>

              {participantsLoading && <div>載入中...</div>}
              
              {!participantsLoading && participants && (
                <DataTable
                  rows={participants.map((p) => ({ ...p, id: p.user_id.toString() }))}
                  headers={[
                    { key: 'username', header: '使用者' },
                    { key: 'joined_at', header: '加入時間' },
                    { key: 'status', header: '狀態' },
                    { key: 'lock_reason', header: '鎖定原因' },
                    { key: 'actions', header: '操作' },
                  ]}
                  render={({ rows, headers, getHeaderProps, getRowProps }) => (
                    <TableContainer>
                      <Table>
                        <TableHead>
                          <TableRow>
                            {headers.map((header) => (
                              <TableHeader {...getHeaderProps({ header })}>
                                {header.header}
                              </TableHeader>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {rows.map((row) => {
                            // Find original participant data
                            const p = participants.find(item => item.user_id.toString() === row.id);
                            if (!p) return null;

                            return (
                              <TableRow {...getRowProps({ row })}>
                                <TableCell>
                                  <div style={{ fontWeight: 'bold' }}>{p.username}</div>
                                  <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                                    {p.user.email}
                                  </div>
                                </TableCell>
                                <TableCell>{new Date(p.joined_at).toLocaleString()}</TableCell>
                                <TableCell>
                                  {p.is_locked ? (
                                    <Tag type="red">已鎖定</Tag>
                                  ) : p.has_finished_exam ? (
                                    <Tag type="green">已交卷</Tag>
                                  ) : (
                                    <Tag type="blue">進行中</Tag>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {p.is_locked && (
                                    <span style={{ color: 'var(--cds-support-error)' }}>
                                      {p.lock_reason}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <Button
                                      size="sm"
                                      kind="ghost"
                                      onClick={() => handleEditClick(p)}
                                    >
                                      編輯
                                    </Button>
                                    {p.is_locked && (
                                      <Button
                                        size="sm"
                                        kind="ghost"
                                        renderIcon={Unlocked}
                                        onClick={() => handleUnlock(p.user_id)}
                                      >
                                        解鎖
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
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
        </TabPanels>
      </Tabs>

      {/* Edit Participant Modal */}
      <Modal
        open={editModalOpen}
        modalHeading="編輯參賽者狀態"
        primaryButtonText="儲存"
        secondaryButtonText="取消"
        onRequestClose={() => setEditModalOpen(false)}
        onRequestSubmit={handleSaveParticipant}
      >
        {editingParticipant && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <strong>使用者:</strong> {editingParticipant.username}
            </div>
            
            <Toggle
              id="edit-is-locked"
              labelText="鎖定狀態"
              toggled={editIsLocked}
              onToggle={(checked) => setEditIsLocked(checked)}
            />
            
            {editIsLocked && (
              <TextInput
                id="edit-lock-reason"
                labelText="鎖定原因"
                value={editLockReason}
                onChange={(e) => setEditLockReason(e.target.value)}
              />
            )}
            
            <Toggle
              id="edit-has-finished"
              labelText="已完成考試 (已交卷)"
              toggled={editHasFinished}
              onToggle={(checked) => setEditHasFinished(checked)}
            />
            <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
              若取消勾選，學生可重新進入考試介面繼續作答
            </p>
          </div>
        )}
      </Modal>

      {/* Add Participant Modal */}
      <Modal
        open={addModalOpen}
        modalHeading="新增參賽者"
        primaryButtonText="新增"
        secondaryButtonText="取消"
        onRequestClose={() => setAddModalOpen(false)}
        onRequestSubmit={handleAddParticipant}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <TextInput
            id="add-username"
            labelText="使用者名稱 (Username)"
            placeholder="請輸入使用者名稱"
            value={addUsername}
            onChange={(e) => setAddUsername(e.target.value)}
          />
          <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
            輸入使用者名稱以將其加入此競賽
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default ContestTeacherView;
