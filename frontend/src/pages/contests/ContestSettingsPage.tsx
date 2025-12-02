import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Form,
  TextInput,
  TextArea,
  Select,
  SelectItem,
  Toggle,
  Button,
  DatePicker,
  DatePickerInput,
  NumberInput,
  Loading,
  InlineNotification,
  Grid,
  Column
} from '@carbon/react';
import { Save } from '@carbon/icons-react';
import { api } from '@/services/api';
import type { ContestDetail, ContestUpdateRequest } from '@/models/contest';
import { Card } from '@/components/common/Card';

const ContestSettingsPage = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [formData, setFormData] = useState<ContestUpdateRequest>({});
  const [notification, setNotification] = useState<{ kind: 'success' | 'error', message: string } | null>(null);

  // Tab management
  const tabMap = ['general', 'participants', 'events'];
  const currentTab = searchParams.get('tab') || 'general';
  const selectedIndex = tabMap.indexOf(currentTab) !== -1 ? tabMap.indexOf(currentTab) : 0;

  const handleTabChange = (index: number) => {
    setSearchParams({ tab: tabMap[index] });
  };

  useEffect(() => {
    if (contestId) {
      loadContest();
    }
  }, [contestId]);

  const loadContest = async () => {
    try {
      setLoading(true);
      const data = await api.getContest(contestId!);
      setContest(data || null);
      setFormData({
        name: data?.name || '',
        description: data?.description || '',
        rules: data?.rules || '',
        start_time: data?.start_time || '',
        end_time: data?.end_time || '',
        visibility: data?.visibility || 'public',
        password: data?.password || '',
        exam_mode_enabled: data?.exam_mode_enabled || false,
        scoreboard_visible_during_contest: data?.scoreboard_visible_during_contest || false,
        allow_view_results: data?.allow_view_results || false,
        allow_multiple_joins: data?.allow_multiple_joins || false,
        ban_tab_switching: data?.ban_tab_switching || false,
        max_cheat_warnings: data?.max_cheat_warnings || 0
      });
    } catch (error) {
      console.error('Failed to load contest', error);
      setNotification({ kind: 'error', message: '無法載入競賽設定' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contestId) return;

    try {
      setSaving(true);
      await api.updateContest(contestId, formData);
      setNotification({ kind: 'success', message: '設定已更新' });
      await loadContest();
    } catch (error) {
      console.error('Failed to update contest', error);
      setNotification({ kind: 'error', message: '更新失敗，請檢查欄位' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;
  if (!contest) return <div>Contest not found</div>;

  return (
    <div className="contest-settings-page" style={{ 
      padding: '2rem', 
      maxWidth: '1600px', 
      margin: '1.5rem auto 0', // 24px top margin
      backgroundColor: 'var(--cds-layer-01)',
      minHeight: 'calc(100vh - 300px)' // Ensure it takes up space
    }}>
      {notification && (
        <InlineNotification
          kind={notification.kind}
          title={notification.kind === 'success' ? '成功' : '錯誤'}
          subtitle={notification.message}
          onClose={() => setNotification(null)}
          style={{ marginBottom: '2rem', maxWidth: '100%' }}
        />
      )}

      <h4 style={{ marginBottom: '2rem', fontWeight: 600 }}>Contest Settings</h4>

      <Form onSubmit={handleSubmit}>
        <Grid>
          {/* Left Column: Basic Info */}
          <Column lg={10} md={8} sm={4} style={{ marginBottom: '1rem' }}>
            <Card title="基本資訊" subtitle="設定競賽名稱、描述與時間">
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
                <TextArea
                  id="description"
                  labelText="競賽描述"
                  helperText="支援 Markdown 語法"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <TextArea
                  id="rules"
                  labelText="競賽規則"
                  helperText="支援 Markdown 語法"
                  value={formData.rules || ''}
                  onChange={(e) => setFormData({ ...formData, rules: e.target.value })}
                  rows={4}
                />
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <DatePicker 
                    datePickerType="single" 
                    dateFormat="m/d/Y"
                    value={formData.start_time ? [new Date(formData.start_time)] : []}
                    onChange={(dates) => {
                      if (dates && dates.length > 0) {
                        setFormData({ ...formData, start_time: dates[0].toISOString() });
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
                  <DatePicker 
                    datePickerType="single" 
                    dateFormat="m/d/Y"
                    value={formData.end_time ? [new Date(formData.end_time)] : []}
                    onChange={(dates) => {
                      if (dates && dates.length > 0) {
                        setFormData({ ...formData, end_time: dates[0].toISOString() });
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
              </div>
            </Card>
          </Column>

          {/* Right Column: Access & Exam Mode */}
          <Column lg={6} md={8} sm={4} style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
              <Card title="存取控制" subtitle="設定競賽的可見性與密碼">
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
              </Card>

              <Card title="考試模式設定" subtitle="啟用防作弊與嚴格監控功能">
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
                      id="allow-results"
                      labelText="允許查看結果 (提交後)"
                      labelA="禁止"
                      labelB="允許"
                      toggled={formData.allow_view_results}
                      onToggle={(checked) => setFormData({ ...formData, allow_view_results: checked })}
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
                  </div>
                )}
              </Card>
            </div>
          </Column>
        </Grid>

        {/* Sticky Footer Actions */}
        <div style={{ 
          marginTop: '2rem', 
          padding: '1rem 0', 
          borderTop: '1px solid var(--cds-border-subtle)', 
          display: 'flex', 
          justifyContent: 'flex-end',
          position: 'sticky',
          bottom: 0,
          backgroundColor: 'var(--cds-layer-01)', // Match container bg
          zIndex: 10
        }}>
          <Button kind="secondary" style={{ marginRight: '1rem' }} onClick={() => loadContest()}>
            取消
          </Button>
          <Button kind="primary" type="submit" renderIcon={Save} disabled={saving}>
            {saving ? '儲存中...' : '儲存設定'}
          </Button>
        </div>
      </Form>
    </div>
  );
};

export default ContestSettingsPage;
