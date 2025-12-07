import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Form,
  TextInput,
  TextArea,
  Select,
  Toggle,
  Button,
  TimePicker,
  TimePickerSelect,
  SelectItem,
  NumberInput,
  Loading,
  InlineNotification,
  Grid,
  Column,
  Tabs,
  Tab,
  TabList,
  TabPanels,
  TabPanel,
  DataTable,
  DatePicker,
  DatePickerInput,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Modal,
  Tag
} from '@carbon/react';
import { Save, Add, Edit, Unlocked, Renew } from '@carbon/icons-react';
import { 
  updateContest, 
  getContest, 
  archiveContest, 
  deleteContest, 
  getContestParticipants, 
  getExamEvents, 
  addContestProblem, 
  removeContestProblem, 
  addParticipant, 
  unlockParticipant, 
  updateParticipant 
} from '@/services/contest';
import type { ContestDetail, ContestParticipant, ContestProblemSummary, ExamEvent } from '@/core/entities/contest.entity';
import type { ContestUpdateRequest } from '@/models/contest';
import { mapContestDetailDto, mapExamEventDto } from '@/core/entities/mappers/contestMapper';
import SurfaceSection from '@/ui/components/layout/SurfaceSection';
import ContainerCard from '@/ui/components/layout/ContainerCard';
import ProblemTable from '@/domains/problem/components/ProblemTable';

const ContestSettingsPage = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [formData, setFormData] = useState<ContestUpdateRequest>({});
  const [notification, setNotification] = useState<{ kind: 'success' | 'error', message: string } | null>(null);
  
  // Local state for time inputs to allow typing
  const [startTimeInput, setStartTimeInput] = useState('');
  const [endTimeInput, setEndTimeInput] = useState('');

  // Problem Management State
  const [problems, setProblems] = useState<ContestProblemSummary[]>([]);
  const [addProblemModalOpen, setAddProblemModalOpen] = useState(false);
  const [newProblemTitle, setNewProblemTitle] = useState('');
  const [newProblemId, setNewProblemId] = useState('');

  // Participant Management State
  const [participants, setParticipants] = useState<ContestParticipant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [addParticipantModalOpen, setAddParticipantModalOpen] = useState(false);
  const [addParticipantUsername, setAddParticipantUsername] = useState('');
  const [editParticipantModalOpen, setEditParticipantModalOpen] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<ContestParticipant | null>(null);
  const [editLockReason, setEditLockReason] = useState('');
  const [editIsLocked, setEditIsLocked] = useState(false);
  const [editHasFinished, setEditHasFinished] = useState(false);

  // Exam Logs State
  const [examEvents, setExamEvents] = useState<ExamEvent[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Danger Zone State
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState('');

  const handleArchiveContest = async () => {
    if (!contestId) return;
    try {
      await archiveContest(contestId);
      setNotification({ kind: 'success', message: '競賽已封存' });
      setArchiveModalOpen(false);
      loadContest();
    } catch (error) {
      console.error('Failed to archive contest', error);
      setNotification({ kind: 'error', message: '封存失敗' });
    }
  };

  const handleDeleteContest = async () => {
    if (!contestId || !contest) return;
    if (deleteConfirmationName !== contest.name) return;
    
    try {
      await deleteContest(contestId);
      navigate('/contests'); // Redirect to contest list
    } catch (error) {
      console.error('Failed to delete contest', error);
      setNotification({ kind: 'error', message: '刪除失敗' });
    }
  };

  useEffect(() => {
    if (contestId) {
      loadContest();
      loadProblems();
    }
  }, [contestId]);

  const loadContest = async () => {
    try {
      setLoading(true);
      const rawData = await getContest(contestId!);
      const data = mapContestDetailDto(rawData);
      setContest(data || null);
      
      // Map camelCase entity to snake_case request DTO for form
      setFormData({
        name: data?.name || '',
        description: data?.description || '',
        rules: data?.rules || '',
        start_time: data?.startTime || '',
        end_time: data?.endTime || '',
        visibility: data?.visibility || 'public',
        password: data?.password || '',
        exam_mode_enabled: data?.examModeEnabled || false,
        scoreboard_visible_during_contest: data?.scoreboardVisibleDuringContest || false,
        allow_multiple_joins: data?.allowMultipleJoins || false,
        ban_tab_switching: data?.banTabSwitching || false,
        max_cheat_warnings: data?.maxCheatWarnings || 0,
        allow_auto_unlock: data?.allowAutoUnlock || false,
        auto_unlock_minutes: data?.autoUnlockMinutes || 0,
        status: (data?.status || 'inactive') as any
      });

      // Initialize local time inputs
      if (data?.startTime) {
        const date = new Date(data.startTime);
        let hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        hours = hours % 12;
        hours = hours ? hours : 12;
        setStartTimeInput(`${hours.toString().padStart(2, '0')}:${minutes}`);
      }
      if (data?.endTime) {
        const date = new Date(data.endTime);
        let hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        hours = hours % 12;
        hours = hours ? hours : 12;
        setEndTimeInput(`${hours.toString().padStart(2, '0')}:${minutes}`);
      }
    } catch (error) {
      console.error('Failed to load contest', error);
      setNotification({ kind: 'error', message: '無法載入競賽設定' });
    } finally {
      setLoading(false);
    }
  };

  const loadProblems = async () => {
    if (!contestId) return;
    try {
      // Fetch contest details again or use a specific endpoint if available
      // Currently getContest returns problems
      const rawData = await getContest(contestId);
      const data = mapContestDetailDto(rawData);
      if (data && data.problems) {
        setProblems(data.problems);
      }
    } catch (error) {
      console.error('Failed to load problems', error);
    }
  };

  const loadParticipants = async () => {
    if (!contestId) return;
    setParticipantsLoading(true);
    try {
      const data = await getContestParticipants(contestId);
      setParticipants(data);
    } catch (error) {
      console.error('Failed to load participants', error);
    } finally {
      setParticipantsLoading(false);
    }
  };

  const loadExamLogs = async () => {
    if (!contestId) return;
    setLogsLoading(true);
    try {
      const rawData = await getExamEvents(contestId);
      setExamEvents(rawData.map(mapExamEventDto));
    } catch (error) {
      console.error('Failed to load exam logs', error);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contestId) return;

    try {
      setSaving(true);
      await updateContest(contestId, formData);
      setNotification({ kind: 'success', message: '設定已更新' });
      await loadContest();
    } catch (error) {
      console.error('Failed to update contest', error);
      setNotification({ kind: 'error', message: '更新失敗，請檢查欄位' });
    } finally {
      setSaving(false);
    }
  };

  // Problem Management Handlers
  const handleAddProblem = async () => {
    if (!contestId) return;
    try {
      if (newProblemId) {
        await addContestProblem(contestId, { problem_id: newProblemId });
      } else if (newProblemTitle) {
        await addContestProblem(contestId, { title: newProblemTitle });
      }
      setAddProblemModalOpen(false);
      setNewProblemId('');
      setNewProblemTitle('');
      loadProblems();
      setNotification({ kind: 'success', message: '題目已新增' });
    } catch (error) {
      console.error('Failed to add problem', error);
      setNotification({ kind: 'error', message: '新增題目失敗' });
    }
  };

  const handleRemoveProblem = async (problemId: string) => {
    if (!contestId || !confirm('確定要從競賽中移除此題目嗎？')) return;
    try {
      await removeContestProblem(contestId, problemId);
      loadProblems();
      setNotification({ kind: 'success', message: '題目已移除' });
    } catch (error) {
      console.error('Failed to remove problem', error);
      setNotification({ kind: 'error', message: '移除題目失敗' });
    }
  };

  // Participant Management Handlers
  const handleAddParticipant = async () => {
    if (!contestId || !addParticipantUsername) return;
    try {
      await addParticipant(contestId, addParticipantUsername);
      setAddParticipantModalOpen(false);
      setAddParticipantUsername('');
      loadParticipants();
      setNotification({ kind: 'success', message: '參賽者已新增' });
    } catch (error: any) {
      setNotification({ kind: 'error', message: error.message || '新增參賽者失敗' });
    }
  };

  const handleUnlockParticipant = async (userId: string) => {
    if (!contestId || !confirm('確定要解除此學生的鎖定嗎？')) return;
    try {
      await unlockParticipant(contestId, Number(userId));
      loadParticipants();
      setNotification({ kind: 'success', message: '已解除鎖定' });
    } catch (error: any) {
      setNotification({ kind: 'error', message: error.message || '解除鎖定失敗' });
    }
  };

  const handleUpdateParticipant = async () => {
    if (!contestId || !editingParticipant) return;
    try {
      await updateParticipant(contestId, Number(editingParticipant.userId), {
        is_locked: editIsLocked,
        lock_reason: editLockReason,
        has_finished_exam: editHasFinished
      });
      setEditParticipantModalOpen(false);
      loadParticipants();
      setNotification({ kind: 'success', message: '參賽者狀態已更新' });
    } catch (error: any) {
      setNotification({ kind: 'error', message: error.message || '更新失敗' });
    }
  };

  const openEditParticipantModal = (p: ContestParticipant) => {
    setEditingParticipant(p);
    setEditIsLocked(p.isLocked);
    setEditLockReason(p.lockReason || '');
    setEditHasFinished(p.hasFinishedExam);
    setEditParticipantModalOpen(true);
  };

  if (loading) return <Loading />;
  if (!contest) return <div>Contest not found</div>;

  return (
    <SurfaceSection>
      <div className="contest-settings-page">
        {notification && (
          <InlineNotification
            kind={notification.kind}
            title={notification.kind === 'success' ? '成功' : '錯誤'}
            subtitle={notification.message}
            onClose={() => setNotification(null)}
            style={{ marginBottom: '1rem', maxWidth: '100%' }}
          />
        )}

        <Tabs>
          <TabList aria-label="Contest Settings Tabs">
            <Tab>基本設定</Tab>
            <Tab onClick={loadProblems}>題目管理</Tab>
            <Tab onClick={loadParticipants}>參賽者管理</Tab>
            <Tab onClick={loadExamLogs}>考試紀錄</Tab>
          </TabList>
          <TabPanels>
            {/* Basic Settings Tab */}
            <TabPanel>
              <div style={{ marginTop: '1.5rem' }}>
                <Form onSubmit={handleSubmit}>
                  <Grid>
                    {/* Left Column: Basic Info */}
                    <Column lg={10} md={8} sm={4} style={{ marginBottom: '1rem' }}>
                      <ContainerCard title="基本資訊">
                        <div style={{ marginBottom: '1.5rem' }}>
                          <TextInput
                            id="name"
                            labelText="競賽名稱"
                            value={formData.name || ''}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            required
                          />
                        </div>
                        <div style={{ marginBottom: '1.5rem' }}>
                          <TextInput
                            id="description"
                            labelText="競賽描述"
                            value={formData.description || ''}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          />
                        </div>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <TextArea
                            id="rules"
                            labelText="競賽規則"
                            helperText="支援 Markdown 語法"
                            value={formData.rules || ''}
                            onChange={(e) => setFormData({ ...formData, rules: e.target.value })}
                            rows={15}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1 }}>
                              <DatePicker 
                                datePickerType="single" 
                                dateFormat="m/d/Y"
                                value={formData.start_time ? [new Date(formData.start_time)] : []}
                                onChange={(dates) => {
                                  if (dates && dates.length > 0) {
                                    const date = dates[0];
                                    const current = formData.start_time ? new Date(formData.start_time) : new Date();
                                    date.setHours(current.getHours());
                                    date.setMinutes(current.getMinutes());
                                    setFormData({ ...formData, start_time: date.toISOString() });
                                  }
                                }}
                              >
                                <DatePickerInput
                                  id="start-date"
                                  labelText="開始日期"
                                  placeholder="mm/dd/yyyy"
                                />
                              </DatePicker>
                            </div>
                            <div style={{ flex: 1 }}>
                              <TimePicker 
                                id="start-time" 
                                labelText="開始時間"
                                type="text"
                                placeholder="hh:mm"
                                pattern="(0[1-9]|1[0-2]):[0-5][0-9]"
                                value={startTimeInput}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setStartTimeInput(val);
                                  
                                  if (val.length === 5 && val.includes(':')) {
                                    const [h, m] = val.split(':').map(Number);
                                    if (!isNaN(h) && !isNaN(m) && h >= 1 && h <= 12 && m >= 0 && m <= 59) {
                                      const date = formData.start_time ? new Date(formData.start_time) : new Date();
                                      const currentHours = date.getHours();
                                      const isPM = currentHours >= 12;
                                      let newHours = h;
                                      
                                      // 12 AM is 0, 12 PM is 12. 
                                      // 1-11 AM is 1-11. 1-11 PM is 13-23.
                                      if (isPM) {
                                          if (h === 12) newHours = 12;
                                          else newHours = h + 12;
                                      } else {
                                          if (h === 12) newHours = 0;
                                          else newHours = h;
                                      }
                                      
                                      date.setHours(newHours);
                                      date.setMinutes(m);
                                      setFormData({ ...formData, start_time: date.toISOString() });
                                    }
                                  }
                                }}
                              >
                                <TimePickerSelect 
                                  id="start-time-select" 
                                  // labelText="AM/PM"
                                  value={(() => {
                                    if (!formData.start_time) return 'AM';
                                    return new Date(formData.start_time).getHours() >= 12 ? 'PM' : 'AM';
                                  })()}
                                  onChange={(e) => {
                                    const newAmp = e.target.value;
                                    const date = formData.start_time ? new Date(formData.start_time) : new Date();
                                    let hours = date.getHours();
                                    
                                    if (newAmp === 'PM' && hours < 12) hours += 12;
                                    if (newAmp === 'AM' && hours >= 12) hours -= 12;
                                    
                                    date.setHours(hours);
                                    setFormData({ ...formData, start_time: date.toISOString() });
                                  }}
                                >
                                  <SelectItem value="AM" text="AM" />
                                  <SelectItem value="PM" text="PM" />
                                </TimePickerSelect>
                              </TimePicker>
                            </div>
                          </div>
                          
                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1 }}>
                              <DatePicker 
                                datePickerType="single" 
                                dateFormat="m/d/Y"
                                value={formData.end_time ? [new Date(formData.end_time)] : []}
                                onChange={(dates) => {
                                  if (dates && dates.length > 0) {
                                    const date = dates[0];
                                    const current = formData.end_time ? new Date(formData.end_time) : new Date();
                                    date.setHours(current.getHours());
                                    date.setMinutes(current.getMinutes());
                                    setFormData({ ...formData, end_time: date.toISOString() });
                                  }
                                }}
                              >
                                <DatePickerInput
                                  id="end-date"
                                  labelText="結束日期"
                                  placeholder="mm/dd/yyyy"
                                />
                              </DatePicker>
                            </div>
                            <div style={{ flex: 1 }}>
                              <TimePicker 
                                id="end-time" 
                                labelText="結束時間"
                                type="text"
                                placeholder="hh:mm"
                                pattern="(0[1-9]|1[0-2]):[0-5][0-9]"
                                value={endTimeInput}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setEndTimeInput(val);
                                  
                                  if (val.length === 5 && val.includes(':')) {
                                    const [h, m] = val.split(':').map(Number);
                                    if (!isNaN(h) && !isNaN(m) && h >= 1 && h <= 12 && m >= 0 && m <= 59) {
                                      const date = formData.end_time ? new Date(formData.end_time) : new Date();
                                      const currentHours = date.getHours();
                                      const isPM = currentHours >= 12;
                                      let newHours = h;
                                      
                                      if (isPM) {
                                          if (h === 12) newHours = 12;
                                          else newHours = h + 12;
                                      } else {
                                          if (h === 12) newHours = 0;
                                          else newHours = h;
                                      }
                                      
                                      date.setHours(newHours);
                                      date.setMinutes(m);
                                      setFormData({ ...formData, end_time: date.toISOString() });
                                    }
                                  }
                                }}
                              >
                                <TimePickerSelect 
                                  id="end-time-select" 
                                  // labelText="AM/PM"
                                  value={(() => {
                                    if (!formData.end_time) return 'AM';
                                    return new Date(formData.end_time).getHours() >= 12 ? 'PM' : 'AM';
                                  })()}
                                  onChange={(e) => {
                                    const newAmp = e.target.value;
                                    const date = formData.end_time ? new Date(formData.end_time) : new Date();
                                    let hours = date.getHours();
                                    
                                    if (newAmp === 'PM' && hours < 12) hours += 12;
                                    if (newAmp === 'AM' && hours >= 12) hours -= 12;
                                    
                                    date.setHours(hours);
                                    setFormData({ ...formData, end_time: date.toISOString() });
                                  }}
                                >
                                  <SelectItem value="AM" text="AM" />
                                  <SelectItem value="PM" text="PM" />
                                </TimePickerSelect>
                              </TimePicker>
                            </div>
                          </div>
                        </div>
                      </ContainerCard>
                    </Column>

                    {/* Right Column: Access & Exam Mode */}
                    <Column lg={6} md={8} sm={4} style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
                        <ContainerCard title="存取控制">
                          <div style={{ marginBottom: '1.5rem' }}>
                            <Select
                              id="visibility"
                              labelText="可見性"
                              value={formData.visibility || 'public'}
                              onChange={(e) => setFormData({ ...formData, visibility: e.target.value as any })}
                            >
                              <SelectItem value="public" text="公開 (Public)" />
                              <SelectItem value="private" text="私有 (Private)" />
                            </Select>
                          </div>
                          {formData.visibility === 'private' && (
                            <div>
                              <TextInput
                                id="password"
                                labelText="加入密碼"
                                type="password"
                                value={formData.password || ''}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                              />
                            </div>
                          )}
                        </ContainerCard>

                        <ContainerCard title="競賽狀態">
                          <div style={{ marginBottom: '1.5rem' }}>
                            <Toggle
                              id="contest-status"
                              labelText="狀態 (Active/Inactive)"
                              labelA="Inactive"
                              labelB="Active"
                              toggled={formData.status === 'active'}
                              onToggle={(checked) => setFormData({ ...formData, status: checked ? 'active' : 'inactive' })}
                            />
                          </div>
                        </ContainerCard>

                        <ContainerCard title="考試模式設定">
                          <div style={{ marginBottom: '1.5rem' }}>
                            <Toggle
                              id="exam-mode"
                              labelText="啟用考試模式"
                              labelA="關閉"
                              labelB="開啟"
                              toggled={formData.exam_mode_enabled}
                              onToggle={(checked) => setFormData({ ...formData, exam_mode_enabled: checked })}
                            />
                          </div>

                          {formData.exam_mode_enabled && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                              <Toggle
                                id="scoreboard-visible"
                                labelText="考試期間顯示排行榜"
                                labelA="隱藏"
                                labelB="顯示"
                                toggled={formData.scoreboard_visible_during_contest}
                                onToggle={(checked) => setFormData({ ...formData, scoreboard_visible_during_contest: checked })}
                              />
                              <Toggle
                                id="allow-multiple-joins"
                                labelText="允許多次加入"
                                labelA="禁止"
                                labelB="允許"
                                toggled={formData.allow_multiple_joins}
                                onToggle={(checked) => setFormData({ ...formData, allow_multiple_joins: checked })}
                              />
                              <Toggle
                                id="ban-tab-switching"
                                labelText="禁止切換分頁 (Anti-Cheat)"
                                labelA="不禁止"
                                labelB="禁止"
                                toggled={formData.ban_tab_switching}
                                onToggle={(checked) => setFormData({ ...formData, ban_tab_switching: checked })}
                              />
                              <NumberInput
                                id="max-warnings"
                                label="最大違規警告次數 (0 = 立即鎖定)"
                                min={0}
                                max={10}
                                value={formData.max_cheat_warnings || 0}
                                onChange={(_, { value }) => setFormData({ ...formData, max_cheat_warnings: Number(value) })}
                              />
                              
                              <div style={{ borderTop: '1px solid var(--cds-border-subtle)', margin: '0.5rem 0' }} />
                              
                              <Toggle
                                id="allow-auto-unlock"
                                labelText="允許自動解鎖 (Allow Auto-Unlock)"
                                labelA="禁止"
                                labelB="允許"
                                toggled={formData.allow_auto_unlock}
                                onToggle={(checked) => setFormData({ ...formData, allow_auto_unlock: checked })}
                              />
                              
                              {formData.allow_auto_unlock && (
                                <NumberInput
                                  id="auto-unlock-minutes"
                                  label="自動解鎖時間 (分鐘)"
                                  helperText="鎖定後經過多少分鐘自動解鎖"
                                  min={1}
                                  max={1440}
                                  value={formData.auto_unlock_minutes || 5}
                                  onChange={(_, { value }) => setFormData({ ...formData, auto_unlock_minutes: Number(value) })}
                                />
                              )}
                            </div>
                          )}
                        </ContainerCard>
                      </div>
                    </Column>
                  </Grid>

                  <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <Button kind="primary" type="submit" renderIcon={Save} disabled={saving}>
                      {saving ? '儲存中...' : '儲存設定'}
                    </Button>
                  </div>
                </Form>

                {/* Danger Zone */}
                <div style={{ marginTop: '3rem', borderTop: '1px solid var(--cds-border-subtle)', paddingTop: '2rem' }}>
                  <h4 style={{ color: 'var(--cds-text-error)', marginBottom: '1rem' }}>危險區域 (Danger Zone)</h4>
                  <div style={{ 
                    border: '1px solid var(--cds-support-error)', 
                    borderRadius: '4px',
                    padding: '1rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <div>
                        <h5 style={{ fontWeight: 600 }}>封存競賽 (Archive Contest)</h5>
                        <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                          封存後競賽將變為唯讀狀態，無法再被啟用。您可以選擇是否將題目公開到練習區。
                        </p>
                      </div>
                      <Button kind="danger--ghost" onClick={() => setArchiveModalOpen(true)} disabled={contest.status === 'archived'}>
                        {contest.status === 'archived' ? '已封存' : '封存競賽'}
                      </Button>
                    </div>
                    
                    <div style={{ borderTop: '1px solid var(--cds-border-subtle)', margin: '1rem 0' }} />
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h5 style={{ fontWeight: 600 }}>刪除競賽 (Delete Contest)</h5>
                        <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
                          此動作無法復原。所有相關資料（包含提交紀錄、排名）將被永久刪除。
                        </p>
                      </div>
                      <Button kind="danger" onClick={() => setDeleteModalOpen(true)}>
                        刪除競賽
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </TabPanel>

            {/* Problem Management Tab */}
            <TabPanel>
              <div style={{ marginTop: '1.5rem' }}>
                <ContainerCard 
                  title="題目列表" 
                  action={
                    <Button size="sm" renderIcon={Add} onClick={() => setAddProblemModalOpen(true)}>
                      新增題目
                    </Button>
                  }
                  noPadding
                >
                  <ProblemTable
                    problems={problems.map(p => ({
                      ...p,
                      id: p.id, // ContestProblem ID
                      problemId: p.problemId, // Actual Problem ID
                      // Ensure label and order are present for contest mode
                      label: p.label || '-',
                      order: p.order || 0,
                      score: p.score || 0,
                      difficulty: p.difficulty as any // Cast to any to avoid strict enum check
                    }))}
                    mode="contest"
                    onAction={(action, problem) => {
                      if (action === 'edit') {
                        navigate(`/teacher/contests/${contestId}/problems/${problem.id}/edit`);
                      } else if (action === 'delete') {
                        // Use id (ContestProblem ID)
                        handleRemoveProblem(problem.id.toString());
                      }
                    }}
                    onAdd={() => setAddProblemModalOpen(true)}
                  />
                </ContainerCard>
              </div>
            </TabPanel>

            {/* Participant Management Tab */}
            <TabPanel>
              <div style={{ marginTop: '1.5rem' }}>
                <ContainerCard
                  title="參賽者列表"
                  action={
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <Button size="sm" kind="ghost" renderIcon={Renew} onClick={loadParticipants}>
                        重新整理
                      </Button>
                      <Button size="sm" renderIcon={Add} onClick={() => setAddParticipantModalOpen(true)}>
                        新增參賽者
                      </Button>
                    </div>
                  }
                  noPadding
                >
                  {participantsLoading ? (
                    <Loading withOverlay={false} />
                  ) : (
                    <DataTable
                      rows={participants.map(p => ({ ...p, id: p.userId.toString() }))}
                      headers={[
                        { key: 'username', header: '使用者' },
                        { key: 'joinedAt', header: '加入時間' },
                        { key: 'status', header: '狀態' },
                        { key: 'lockReason', header: '鎖定原因' },
                        { key: 'actions', header: '操作' }
                      ]}
                    >
                      {({ rows, headers, getHeaderProps, getRowProps, getTableProps }: any) => (
                        <TableContainer>
                          <Table {...getTableProps()}>
                            <TableHead>
                              <TableRow>
                                {headers.map((header: any) => (
                                  <TableHeader {...getHeaderProps({ header })} key={header.key}>
                                    {header.header}
                                  </TableHeader>
                                ))}
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {rows.map((row: any) => {
                                const p = participants.find(item => item.userId.toString() === row.id);
                                if (!p) return null;
                                return (
                                  <TableRow {...getRowProps({ row })} key={row.id}>
                                    <TableCell>
                                      <div style={{ fontWeight: 600 }}>{p.username}</div>
                                      <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                                        {p.email}
                                      </div>
                                    </TableCell>
                                    <TableCell>{new Date(p.joinedAt).toLocaleString('zh-TW')}</TableCell>
                                    <TableCell>
                                      {p.isLocked ? (
                                        <Tag type="red">已鎖定</Tag>
                                      ) : p.hasFinishedExam ? (
                                        <Tag type="green">已交卷</Tag>
                                      ) : (
                                        <Tag type="blue">進行中</Tag>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      {p.isLocked && (
                                        <span style={{ color: 'var(--cds-text-error)', fontSize: '0.875rem' }}>
                                          {p.lockReason}
                                        </span>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <Button
                                          kind="ghost"
                                          size="sm"
                                          renderIcon={Edit}
                                          hasIconOnly
                                          iconDescription="編輯狀態"
                                          onClick={() => openEditParticipantModal(p)}
                                        />
                                        {p.isLocked && (
                                          <Button
                                            kind="ghost"
                                            size="sm"
                                            renderIcon={Unlocked}
                                            hasIconOnly
                                            iconDescription="解除鎖定"
                                            onClick={() => handleUnlockParticipant(p.userId)}
                                          />
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
                    </DataTable>
                  )}
                </ContainerCard>
              </div>
            </TabPanel>

            {/* Exam Logs Tab */}
            <TabPanel>
              <div style={{ marginTop: '1.5rem' }}>
                <ContainerCard 
                  title="考試紀錄" 
                  action={
                    <Button size="sm" kind="ghost" renderIcon={Renew} onClick={loadExamLogs}>
                      重新整理
                    </Button>
                  }
                  noPadding
                >
                  {logsLoading ? (
                    <Loading withOverlay={false} />
                  ) : (
                    <DataTable
                      rows={examEvents.map((e, idx) => ({ ...e, id: e.id?.toString() || idx.toString() }))}
                      headers={[
                        { key: 'userName', header: '使用者' },
                        { key: 'eventType', header: '事件類型' },
                        { key: 'timestamp', header: '時間' },
                        { key: 'reason', header: '詳細資訊' }
                      ]}
                    >
                      {({ rows, headers, getHeaderProps, getRowProps, getTableProps }: any) => (
                        <TableContainer>
                          <Table {...getTableProps()}>
                            <TableHead>
                              <TableRow>
                                {headers.map((header: any) => (
                                  <TableHeader {...getHeaderProps({ header })} key={header.key}>
                                    {header.header}
                                  </TableHeader>
                                ))}
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {rows.map((row: any) => {
                                const event = examEvents.find((e, idx) => (e.id?.toString() || idx.toString()) === row.id);
                                return (
                                  <TableRow {...getRowProps({ row })} key={row.id}>
                                    <TableCell>{event?.userName || 'Unknown'}</TableCell>
                                    <TableCell>
                                      <Tag type={event?.eventType === 'tab_hidden' ? 'red' : 'gray'}>
                                        {event?.eventType}
                                      </Tag>
                                    </TableCell>
                                    <TableCell>{new Date(event?.timestamp || '').toLocaleString('zh-TW')}</TableCell>
                                    <TableCell>
                                      <div style={{ fontSize: '0.875rem', fontFamily: 'monospace' }}>
                                        {event?.reason || '-'}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      )}
                    </DataTable>
                  )}
                </ContainerCard>
              </div>
            </TabPanel>
          </TabPanels>
        </Tabs>

        {/* Add Problem Modal */}
        <Modal
          open={addProblemModalOpen}
          modalHeading="新增題目"
          primaryButtonText="新增"
          secondaryButtonText="取消"
          onRequestClose={() => setAddProblemModalOpen(false)}
          onRequestSubmit={handleAddProblem}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <TextInput
              id="problem-id"
              labelText="題目 ID (Existing Problem ID)"
              placeholder="輸入現有題目 ID"
              value={newProblemId}
              onChange={(e) => setNewProblemId(e.target.value)}
            />
            <div style={{ textAlign: 'center', color: 'var(--cds-text-secondary)' }}>- 或 -</div>
            <TextInput
              id="problem-title"
              labelText="新題目標題 (Create New)"
              placeholder="輸入新題目標題"
              value={newProblemTitle}
              onChange={(e) => setNewProblemTitle(e.target.value)}
            />
          </div>
        </Modal>

        {/* Add Participant Modal */}
        <Modal
          open={addParticipantModalOpen}
          modalHeading="新增參賽者"
          primaryButtonText="新增"
          secondaryButtonText="取消"
          onRequestClose={() => setAddParticipantModalOpen(false)}
          onRequestSubmit={handleAddParticipant}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <TextInput
              id="add-username"
              labelText="使用者名稱 (Username)"
              placeholder="請輸入使用者名稱"
              value={addParticipantUsername}
              onChange={(e) => setAddParticipantUsername(e.target.value)}
            />
          </div>
        </Modal>

        {/* Edit Participant Modal */}
        <Modal
          open={editParticipantModalOpen}
          modalHeading="編輯參賽者狀態"
          primaryButtonText="儲存"
          secondaryButtonText="取消"
          onRequestClose={() => setEditParticipantModalOpen(false)}
          onRequestSubmit={handleUpdateParticipant}
        >
          {editingParticipant && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <strong>使用者:</strong> {editingParticipant.username}
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>鎖定狀態</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {editIsLocked ? (
                    <>
                      <Tag type="red">已鎖定</Tag>
                      <Button 
                        kind="ghost" 
                        size="sm" 
                        renderIcon={Unlocked}
                        onClick={() => {
                          handleUnlockParticipant(editingParticipant.userId);
                          setEditParticipantModalOpen(false);
                        }}
                      >
                        解除鎖定
                      </Button>
                    </>
                  ) : (
                    <Tag type="green">未鎖定</Tag>
                  )}
                </div>
              </div>
              
              {editIsLocked && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>鎖定原因</div>
                  <div style={{ 
                    padding: '0.5rem', 
                    backgroundColor: 'var(--cds-layer-01)', 
                    border: '1px solid var(--cds-border-subtle)',
                    borderRadius: '4px'
                  }}>
                    {editLockReason}
                  </div>
                </div>
              )}
              
              <Toggle
                id="edit-has-finished"
                labelText="已完成考試 (已交卷)"
                toggled={editHasFinished}
                onToggle={(checked) => setEditHasFinished(checked)}
              />
            </div>
          )}
        </Modal>

        {/* Archive Confirmation Modal */}
        <Modal
          open={archiveModalOpen}
          modalHeading="確認封存競賽"
          primaryButtonText="確認封存"
          secondaryButtonText="取消"
          danger
          onRequestClose={() => setArchiveModalOpen(false)}
          onRequestSubmit={handleArchiveContest}
        >
          <p style={{ marginBottom: '1rem' }}>
            您確定要封存此競賽嗎？此動作無法復原。
            封存後，競賽將變為唯讀狀態，且無法再被啟用。
          </p>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          open={deleteModalOpen}
          modalHeading="確認刪除競賽"
          primaryButtonText="確認刪除"
          secondaryButtonText="取消"
          danger
          primaryButtonDisabled={deleteConfirmationName !== contest.name}
          onRequestClose={() => setDeleteModalOpen(false)}
          onRequestSubmit={handleDeleteContest}
        >
          <p style={{ marginBottom: '1rem', color: 'var(--cds-text-error)' }}>
            <strong>警告：此動作無法復原！</strong>
          </p>
          <p style={{ marginBottom: '1rem' }}>
            這將永久刪除競賽 <strong>{contest.name}</strong> 及其所有相關資料（包含提交紀錄、排名、事件紀錄）。
          </p>
          <TextInput
            id="delete-confirmation"
            labelText={`請輸入 "${contest.name}" 以確認刪除`}
            placeholder={contest.name}
            value={deleteConfirmationName}
            onChange={(e) => setDeleteConfirmationName(e.target.value)}
          />
        </Modal>
      </div>
    </SurfaceSection>
  );
};

export default ContestSettingsPage;
