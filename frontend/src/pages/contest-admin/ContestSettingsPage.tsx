import React, { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  Form,
  TextInput,
  TextArea,
  Select,
  SelectItem,
  Toggle,
  Button,
  TimePicker,
  TimePickerSelect,
  NumberInput,
  InlineNotification,
  Grid,
  Column,
  DatePicker,
  DatePickerInput,
  Modal
} from '@carbon/react';
import { Save } from '@carbon/icons-react';
import { api } from '@/services/api';
import type { ContestDetail, ContestUpdateRequest, ContestVisibility } from '@/core/entities/contest.entity';
import { mapContestUpdateRequestToDto } from '@/core/entities/mappers/contestMapper';
import ContainerCard from '@/components/contest/layout/ContainerCard';

interface ContestAdminContext {
  contest: ContestDetail;
  refreshContest: () => void;
}

const ContestSettingsPage: React.FC = () => {
  const { contest, refreshContest } = useOutletContext<ContestAdminContext>();
  const navigate = useNavigate();

  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<ContestUpdateRequest>({});
  const [notification, setNotification] = useState<{ kind: 'success' | 'error', message: string } | null>(null);
  
  // Local state for time inputs to allow typing
  const [startTimeInput, setStartTimeInput] = useState('');
  const [endTimeInput, setEndTimeInput] = useState('');

  // Danger Zone State
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState('');

  useEffect(() => {
    if (contest) {
      setFormData({
        name: contest.name || '',
        description: contest.description || '',
        rules: contest.rules || '',
        startTime: contest.startTime || '',
        endTime: contest.endTime || '',
        visibility: contest.visibility || 'public',
        password: contest.password || '',
        examModeEnabled: contest.examModeEnabled || false,
        scoreboardVisibleDuringContest: contest.scoreboardVisibleDuringContest || false,
        allowMultipleJoins: contest.allowMultipleJoins || false,
        banTabSwitching: contest.banTabSwitching || false,
        maxCheatWarnings: contest.maxCheatWarnings || 0,
        allowAutoUnlock: contest.allowAutoUnlock || false,
        autoUnlockMinutes: contest.autoUnlockMinutes || 0,
        status: contest.status || 'inactive'
      });

      // Initialize local time inputs
      if (contest.startTime) {
        const date = new Date(contest.startTime);
        let hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        hours = hours % 12;
        hours = hours ? hours : 12;
        setStartTimeInput(`${hours.toString().padStart(2, '0')}:${minutes}`);
      }
      if (contest.endTime) {
        const date = new Date(contest.endTime);
        let hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        hours = hours % 12;
        hours = hours ? hours : 12;
        setEndTimeInput(`${hours.toString().padStart(2, '0')}:${minutes}`);
      }
    }
  }, [contest]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contest.id) return;

    // Validation: Start time must be before end time
    // Validation: Start time must be before end time
    if (formData.startTime && formData.endTime) {
      const start = new Date(formData.startTime);
      const end = new Date(formData.endTime);
      if (start >= end) {
        setNotification({ kind: 'error', message: '結束時間必須晚於開始時間' });
        return;
      }
    }

    try {
      setSaving(true);
      const dto = mapContestUpdateRequestToDto(formData);
      await api.updateContest(contest.id.toString(), dto);
      setNotification({ kind: 'success', message: '設定已更新' });
      refreshContest();
    } catch (error) {
      console.error('Failed to update contest', error);
      setNotification({ kind: 'error', message: '更新失敗，請檢查欄位' });
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveContest = async () => {
    if (!contest.id) return;
    try {
      await api.archiveContest(contest.id.toString());
      setNotification({ kind: 'success', message: '競賽已封存' });
      setArchiveModalOpen(false);
      refreshContest();
    } catch (error) {
      console.error('Failed to archive contest', error);
      setNotification({ kind: 'error', message: '封存失敗' });
    }
  };

  const handleDeleteContest = async () => {
    if (!contest.id) return;
    if (deleteConfirmationName !== contest.name) return;
    
    try {
      await api.deleteContest(contest.id.toString());
      navigate('/contests'); // Redirect to contest list
    } catch (error) {
      console.error('Failed to delete contest', error);
      setNotification({ kind: 'error', message: '刪除失敗' });
    }
  };

  return (
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
                      value={formData.startTime ? [new Date(formData.startTime)] : []}
                      onChange={(dates) => {
                        if (dates && dates.length > 0) {
                          const date = dates[0];
                          const current = formData.startTime ? new Date(formData.startTime) : new Date();
                          date.setHours(current.getHours());
                          date.setMinutes(current.getMinutes());
                          setFormData({ ...formData, startTime: date.toISOString() });
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
                            const date = formData.startTime ? new Date(formData.startTime) : new Date();
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
                            setFormData({ ...formData, startTime: date.toISOString() });
                          }
                        }
                      }}
                    >
                      <TimePickerSelect 
                        id="start-time-select" 
                        // labelText="AM/PM"
                        value={(() => {
                          if (!formData.startTime) return 'AM';
                          return new Date(formData.startTime).getHours() >= 12 ? 'PM' : 'AM';
                        })()}
                        onChange={(e) => {
                          const newAmp = e.target.value;
                          const date = formData.startTime ? new Date(formData.startTime) : new Date();
                          let hours = date.getHours();
                          
                          if (newAmp === 'PM' && hours < 12) hours += 12;
                          if (newAmp === 'AM' && hours >= 12) hours -= 12;
                          
                          date.setHours(hours);
                          setFormData({ ...formData, startTime: date.toISOString() });
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
                      value={formData.endTime ? [new Date(formData.endTime)] : []}
                      onChange={(dates) => {
                        if (dates && dates.length > 0) {
                          const date = dates[0];
                          const current = formData.endTime ? new Date(formData.endTime) : new Date();
                          date.setHours(current.getHours());
                          date.setMinutes(current.getMinutes());
                          setFormData({ ...formData, endTime: date.toISOString() });
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
                            const date = formData.endTime ? new Date(formData.endTime) : new Date();
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
                            setFormData({ ...formData, endTime: date.toISOString() });
                          }
                        }
                      }}
                    >
                      <TimePickerSelect 
                        id="end-time-select" 
                        // labelText="AM/PM"
                        value={(() => {
                          if (!formData.endTime) return 'AM';
                          return new Date(formData.endTime).getHours() >= 12 ? 'PM' : 'AM';
                        })()}
                        onChange={(e) => {
                          const newAmp = e.target.value;
                          const date = formData.endTime ? new Date(formData.endTime) : new Date();
                          let hours = date.getHours();
                          
                          if (newAmp === 'PM' && hours < 12) hours += 12;
                          if (newAmp === 'AM' && hours >= 12) hours -= 12;
                          
                          date.setHours(hours);
                          setFormData({ ...formData, endTime: date.toISOString() });
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
                    onChange={(e) => setFormData({ ...formData, visibility: e.target.value as ContestVisibility })}
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
                    toggled={formData.examModeEnabled}
                    onToggle={(checked) => setFormData({ ...formData, examModeEnabled: checked })}
                  />
                </div>

                {formData.examModeEnabled && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <Toggle
                      id="scoreboard-visible"
                      labelText="考試期間顯示排行榜"
                      labelA="隱藏"
                      labelB="顯示"
                      toggled={formData.scoreboardVisibleDuringContest}
                      onToggle={(checked) => setFormData({ ...formData, scoreboardVisibleDuringContest: checked })}
                    />
                    <Toggle
                      id="allow-multiple-joins"
                      labelText="允許多次加入"
                      labelA="禁止"
                      labelB="允許"
                      toggled={formData.allowMultipleJoins}
                      onToggle={(checked) => setFormData({ ...formData, allowMultipleJoins: checked })}
                    />
                    <Toggle
                      id="ban-tab-switching"
                      labelText="禁止切換分頁 (Anti-Cheat)"
                      labelA="不禁止"
                      labelB="禁止"
                      toggled={formData.banTabSwitching}
                      onToggle={(checked) => setFormData({ ...formData, banTabSwitching: checked })}
                    />
                    <NumberInput
                      id="max-warnings"
                      label="最大違規警告次數 (0 = 立即鎖定)"
                      min={0}
                      max={10}
                      value={formData.maxCheatWarnings || 0}
                      onChange={(_, { value }) => setFormData({ ...formData, maxCheatWarnings: Number(value) })}
                    />
                    
                    <div style={{ borderTop: '1px solid var(--cds-border-subtle)', margin: '0.5rem 0' }} />
                    
                    <Toggle
                      id="allow-auto-unlock"
                      labelText="允許自動解鎖 (Allow Auto-Unlock)"
                      labelA="禁止"
                      labelB="允許"
                      toggled={formData.allowAutoUnlock}
                      onToggle={(checked) => setFormData({ ...formData, allowAutoUnlock: checked })}
                    />
                    
                    {formData.allowAutoUnlock && (
                      <NumberInput
                        id="auto-unlock-minutes"
                        label="自動解鎖時間 (分鐘)"
                        helperText="鎖定後經過多少分鐘自動解鎖"
                        min={1}
                        max={1440}
                        value={formData.autoUnlockMinutes || 5}
                        onChange={(_, { value }) => setFormData({ ...formData, autoUnlockMinutes: Number(value) })}
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

      {/* Archive Modal */}
      <Modal
        open={archiveModalOpen}
        modalHeading="封存競賽"
        primaryButtonText="確認封存"
        secondaryButtonText="取消"
        onRequestSubmit={handleArchiveContest}
        onRequestClose={() => setArchiveModalOpen(false)}
        danger
      >
        <p>確定要封存此競賽嗎？此動作將無法復原。</p>
      </Modal>

      {/* Delete Modal */}
      <Modal
        open={deleteModalOpen}
        modalHeading="刪除競賽"
        primaryButtonText="確認刪除"
        secondaryButtonText="取消"
        onRequestSubmit={handleDeleteContest}
        onRequestClose={() => setDeleteModalOpen(false)}
        danger
        primaryButtonDisabled={deleteConfirmationName !== contest.name}
      >
        <p style={{ marginBottom: '1rem' }}>此動作將永久刪除競賽及其所有資料，無法復原。</p>
        <p style={{ marginBottom: '0.5rem' }}>請輸入 <strong>{contest.name}</strong> 以確認刪除：</p>
        <TextInput
          id="delete-confirmation"
          labelText="確認名稱"
          placeholder={contest.name}
          value={deleteConfirmationName}
          onChange={(e) => setDeleteConfirmationName(e.target.value)}
        />
      </Modal>
    </div>
  );
};

export default ContestSettingsPage;
