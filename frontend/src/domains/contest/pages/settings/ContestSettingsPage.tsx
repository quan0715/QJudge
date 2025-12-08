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
  DatePicker,
  DatePickerInput
} from '@carbon/react';
import { Save } from '@carbon/icons-react';
import { updateContest, getContest, archiveContest, deleteContest } from '@/services/contest';
import type { ContestDetail } from '@/core/entities/contest.entity';
import type { ContestUpdateRequest } from '@/models/contest';

import ContainerCard from '@/ui/components/layout/ContainerCard';
import SurfaceSection from '@/ui/components/layout/SurfaceSection';

const ContestAdminSettingsPage = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [formData, setFormData] = useState<ContestUpdateRequest>({});
  const [notification, setNotification] = useState<{ kind: 'success' | 'error', message: string } | null>(null);
  
  // Local state for time inputs
  const [startTimeInput, setStartTimeInput] = useState('');
  const [endTimeInput, setEndTimeInput] = useState('');
  // Local state for date inputs  
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');

  // Danger Zone State
  // const [archiveModalOpen, setArchiveModalOpen] = useState(false); 
  // const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  useEffect(() => {
    if (contestId) {
      loadContest();
    }
  }, [contestId]);

  const loadContest = async () => {
    try {
      setLoading(true);
      const data = await getContest(contestId!);
      setContest(data || null);
      
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

        max_cheat_warnings: data?.maxCheatWarnings || 0,
        allow_auto_unlock: data?.allowAutoUnlock || false,
        auto_unlock_minutes: data?.autoUnlockMinutes || 0,
        status: (data?.status || 'inactive') as any,
        anonymous_mode_enabled: data?.anonymousModeEnabled || false,
      });

      if (data?.startTime) {
        initTimeInput(data.startTime, setStartTimeInput);
        initDateInput(data.startTime, setStartDateInput);
      }
      if (data?.endTime) {
        initTimeInput(data.endTime, setEndTimeInput);
        initDateInput(data.endTime, setEndDateInput);
      }
    } catch (error) {
      console.error('Failed to load contest', error);
      setNotification({ kind: 'error', message: '無法載入競賽設定' });
    } finally {
      setLoading(false);
    }
  };

  const initTimeInput = (dateStr: string, setter: (val: string) => void) => {
    const date = new Date(dateStr);
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    hours = hours % 12;
    hours = hours ? hours : 12;
    setter(`${hours.toString().padStart(2, '0')}:${minutes}`);
  };

  const initDateInput = (dateStr: string, setter: (val: string) => void) => {
    const date = new Date(dateStr);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();
    setter(`${month}/${day}/${year}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contestId) return;

    try {
      setSaving(true);
      
      // Filter out empty password to avoid overwriting existing password
      const payload = { ...formData };
      if (!payload.password) {
        delete payload.password;
      }

      await updateContest(contestId, payload);
      setNotification({ kind: 'success', message: '設定已更新' });
      await loadContest();
    } catch (error) {
      console.error('Failed to update contest', error);
      setNotification({ kind: 'error', message: '更新失敗，請檢查欄位' });
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!contestId || !confirm('確定要封存此競賽嗎？')) return;
    try {
      await archiveContest(contestId);
      setNotification({ kind: 'success', message: '競賽已封存' });
      loadContest();
    } catch (error) {
        setNotification({ kind: 'error', message: '封存失敗' });
    }
  };

  const handleDelete = async () => {
    if (!contestId || !confirm('確定要刪除此競賽嗎？此動作無法復原！')) return;
    try {
      await deleteContest(contestId);
      navigate('/contests');
    } catch (error) {
       setNotification({ kind: 'error', message: '刪除失敗' });
    }
  };

  // Helper for TimePicker change
  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'start_time' | 'end_time', inputSetter: (v: string) => void) => {
    const val = e.target.value;
    inputSetter(val);
    
    if (val.length === 5 && val.includes(':')) {
      const [h, m] = val.split(':').map(Number);
      if (!isNaN(h) && !isNaN(m) && h >= 1 && h <= 12 && m >= 0 && m <= 59) {
        const date = formData[field] ? new Date(formData[field]!) : new Date();
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
        setFormData({ ...formData, [field]: date.toISOString() });
      }
    }
  };

  const handleAmpPmChange = (value: string, field: 'start_time' | 'end_time') => {
    const date = formData[field] ? new Date(formData[field]!) : new Date();
    let hours = date.getHours();
    
    if (value === 'PM' && hours < 12) hours += 12;
    if (value === 'AM' && hours >= 12) hours -= 12;
    
    date.setHours(hours);
    setFormData({ ...formData, [field]: date.toISOString() });
  };

  const handleDateChange = (dates: Date[], field: 'start_time' | 'end_time', dateSetter: (val: string) => void) => {
      if (dates && dates.length > 0) {
        const date = dates[0];
        const current = formData[field] ? new Date(formData[field]!) : new Date();
        date.setHours(current.getHours());
        date.setMinutes(current.getMinutes());
        setFormData({ ...formData, [field]: date.toISOString() });
        // Update local date input
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const year = date.getFullYear();
        dateSetter(`${month}/${day}/${year}`);
      }
  };

  if (loading) return <Loading />;
  if (!contest) return <div>Contest not found</div>;

  return (
    <SurfaceSection maxWidth="1056px" style={{ flex: 1, minHeight: '100%' }}>
      <div style={{ padding: '0', maxWidth: '100%', margin: '0 auto', width: '100%' }}>
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
                  {/* Start Time */}
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <DatePicker 
                        datePickerType="single" 
                        dateFormat="m/d/Y"
                        value={startDateInput}
                        onChange={(d) => handleDateChange(d, 'start_time', setStartDateInput)}
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
                        onChange={(e) => handleTimeChange(e, 'start_time', setStartTimeInput)}
                      >
                        <TimePickerSelect 
                          id="start-time-select" 
                          value={formData.start_time && new Date(formData.start_time).getHours() >= 12 ? 'PM' : 'AM'}
                          onChange={(e) => handleAmpPmChange(e.target.value, 'start_time')}
                        >
                          <SelectItem value="AM" text="AM" />
                          <SelectItem value="PM" text="PM" />
                        </TimePickerSelect>
                      </TimePicker>
                    </div>
                  </div>
                  
                  {/* End Time */}
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <DatePicker 
                        datePickerType="single" 
                        dateFormat="m/d/Y"
                        value={endDateInput}
                        onChange={(d) => handleDateChange(d, 'end_time', setEndDateInput)}
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
                        onChange={(e) => handleTimeChange(e, 'end_time', setEndTimeInput)}
                      >
                        <TimePickerSelect 
                          id="end-time-select" 
                          value={formData.end_time && new Date(formData.end_time).getHours() >= 12 ? 'PM' : 'AM'}
                          onChange={(e) => handleAmpPmChange(e.target.value, 'end_time')}
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

                <ContainerCard title="排行榜設定">
                  <div style={{ marginBottom: '1rem' }}>
                    <Toggle
                      id="scoreboard-visible-global"
                      labelText="比賽期間顯示排行榜"
                      labelA="隱藏"
                      labelB="顯示"
                      toggled={formData.scoreboard_visible_during_contest}
                      onToggle={(checked) => setFormData({ ...formData, scoreboard_visible_during_contest: checked })}
                    />
                    <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginTop: '0.5rem' }}>
                      允許參賽者在比賽進行中查看即時排行榜
                    </p>
                  </div>
                  <div style={{ borderTop: '1px solid var(--cds-border-subtle)', margin: '1rem 0' }} />
                  <div>
                    <Toggle
                      id="anonymous-mode"
                      labelText="匿名模式"
                      labelA="關閉"
                      labelB="開啟"
                      toggled={formData.anonymous_mode_enabled}
                      onToggle={(checked) => setFormData({ ...formData, anonymous_mode_enabled: checked })}
                    />
                    <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginTop: '0.5rem' }}>
                      開啟後，參賽者可設定暱稱，排行榜和提交列表將顯示暱稱
                    </p>
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
                        id="allow-multiple-joins"
                        labelText="允許多次加入"
                        labelA="禁止"
                        labelB="允許"
                        toggled={formData.allow_multiple_joins}
                        onToggle={(checked) => setFormData({ ...formData, allow_multiple_joins: checked })}
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
                  封存後競賽將變為唯讀狀態，無法再被啟用。
                </p>
              </div>
              <Button kind="danger--ghost" onClick={handleArchive} disabled={contest?.status === 'archived'}>
                {contest?.status === 'archived' ? '已封存' : '封存競賽'}
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
              <Button kind="danger" onClick={handleDelete}>
                刪除競賽
              </Button>
            </div>
          </div>
        </div>
      </div>
    </SurfaceSection>
  );
};

export default ContestAdminSettingsPage;
