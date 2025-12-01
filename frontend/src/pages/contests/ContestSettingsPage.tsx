import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
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
  Tabs,
  Tab,
  TabList,
  TabPanels,
  TabPanel
} from '@carbon/react';
import { Save } from '@carbon/icons-react';
import { api } from '@/services/api';
import type { ContestDetail, ContestUpdateRequest } from '@/models/contest';
import ContestParticipantsPage from './ContestParticipantsPage';
import ContestEventsPage from './ContestEventsPage';

const ContestSettingsPage = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
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
      setContest(data);
      setFormData({
        name: data?.name || '',
        description: data?.description || '',
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
      // Reload to ensure sync
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
    <div className="cds--grid" style={{ padding: '2rem' }}>
      <div className="cds--row">
        <div className="cds--col-lg-16">
          <h2 style={{ marginBottom: '2rem' }}>競賽管理</h2>
          
          <Tabs selectedIndex={selectedIndex} onChange={({ selectedIndex }) => handleTabChange(selectedIndex)}>
            <TabList aria-label="Contest management tabs">
              <Tab>基本設定</Tab>
              <Tab>參賽者管理</Tab>
              <Tab>考試 Log List</Tab>
            </TabList>
            <TabPanels>
              {/* General Settings Tab */}
              <TabPanel>
                <div style={{ marginTop: '2rem', maxWidth: '800px' }}>
                  {notification && (
                    <InlineNotification
                      kind={notification.kind}
                      title={notification.kind === 'success' ? '成功' : '錯誤'}
                      subtitle={notification.message}
                      onClose={() => setNotification(null)}
                      style={{ marginBottom: '2rem' }}
                    />
                  )}

                  <Form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '2rem' }}>
                      <TextInput
                        id="name"
                        labelText="競賽名稱"
                        value={formData.name || ''}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                      />
                    </div>

                    <div style={{ marginBottom: '2rem' }}>
                      <TextArea
                        id="description"
                        labelText="競賽描述 (支援 Markdown)"
                        value={formData.description || ''}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        rows={4}
                      />
                    </div>

                    <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem' }}>
                      <div style={{ flex: 1 }}>
                        <DatePicker datePickerType="single" onChange={() => {
                          // Simplified handling
                        }}>
                          <DatePickerInput
                            id="start-date"
                            labelText="開始日期"
                            placeholder="mm/dd/yyyy"
                          />
                        </DatePicker>
                      </div>
                      <div style={{ flex: 1 }}>
                        <DatePicker datePickerType="single">
                          <DatePickerInput
                            id="end-date"
                            labelText="結束日期"
                            placeholder="mm/dd/yyyy"
                          />
                        </DatePicker>
                      </div>
                    </div>

                    <div style={{ marginBottom: '2rem' }}>
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
                      <div style={{ marginBottom: '2rem' }}>
                        <TextInput
                          id="password"
                          labelText="加入密碼"
                          type="password"
                          value={formData.password || ''}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        />
                      </div>
                    )}

                    <h4 style={{ marginTop: '3rem', marginBottom: '1rem' }}>考試模式設定</h4>
                    
                    <div style={{ marginBottom: '1rem' }}>
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
                      <div style={{ paddingLeft: '1rem', borderLeft: '4px solid var(--cds-ui-03)' }}>
                        <div style={{ marginBottom: '1rem' }}>
                          <Toggle
                            id="scoreboard-visible"
                            labelText="考試期間顯示排行榜"
                            labelA="隱藏"
                            labelB="顯示"
                            toggled={formData.scoreboard_visible_during_contest}
                            onToggle={(checked) => setFormData({ ...formData, scoreboard_visible_during_contest: checked })}
                          />
                        </div>
                        
                        <div style={{ marginBottom: '1rem' }}>
                          <Toggle
                            id="allow-results"
                            labelText="允許查看結果 (提交後)"
                            labelA="禁止"
                            labelB="允許"
                            toggled={formData.allow_view_results}
                            onToggle={(checked) => setFormData({ ...formData, allow_view_results: checked })}
                          />
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                          <Toggle
                            id="allow-multiple-joins"
                            labelText="允許多次加入 (重新進入)"
                            labelA="禁止"
                            labelB="允許"
                            toggled={formData.allow_multiple_joins}
                            onToggle={(checked) => setFormData({ ...formData, allow_multiple_joins: checked })}
                          />
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                          <Toggle
                            id="ban-tab-switching"
                            labelText="禁止切換分頁 (Anti-Cheat)"
                            labelA="不禁止"
                            labelB="禁止"
                            toggled={formData.ban_tab_switching}
                            onToggle={(checked) => setFormData({ ...formData, ban_tab_switching: checked })}
                          />
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                          <NumberInput
                            id="max-warnings"
                            label="最大違規警告次數 (0 = 立即鎖定)"
                            min={0}
                            max={10}
                            value={formData.max_cheat_warnings || 0}
                            onChange={(e, { value }) => setFormData({ ...formData, max_cheat_warnings: Number(value) })}
                          />
                        </div>
                      </div>
                    )}

                    <div style={{ marginTop: '3rem', display: 'flex', justifyContent: 'flex-end' }}>
                      <Button kind="secondary" onClick={() => navigate(`/contests/${contestId}`)} style={{ marginRight: '1rem' }}>
                        取消
                      </Button>
                      <Button kind="primary" type="submit" renderIcon={Save} disabled={saving}>
                        {saving ? '儲存中...' : '儲存設定'}
                      </Button>
                    </div>
                  </Form>
                </div>
              </TabPanel>

              {/* Participants Tab */}
              <TabPanel>
                <div style={{ marginTop: '1rem' }}>
                  <ContestParticipantsPage />
                </div>
              </TabPanel>

              {/* Exam Logs Tab */}
              <TabPanel>
                <div style={{ marginTop: '1rem' }}>
                  <ContestEventsPage />
                </div>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default ContestSettingsPage;
