import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Form,
  TextInput,
  TextArea,
  DatePicker,
  DatePickerInput,
  TimePicker,
  TimePickerSelect,
  SelectItem,
  Button,
  Grid,
  Column,
  Toggle,
  Loading,
  InlineNotification,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Modal,
  Tag,
  Tabs,
  Tab,
  TabList,
  TabPanels,
  TabPanel
} from '@carbon/react';
import { Save, ArrowLeft, Add, TrashCan, ChevronUp, ChevronDown } from '@carbon/icons-react';
import { api } from '../services/api';
import type { Contest, Problem } from '../services/api';

const TeacherContestEditPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;
  
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Data
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState('');
  const [allowViewResults, setAllowViewResults] = useState(true);
  const [allowMultipleJoins, setAllowMultipleJoins] = useState(false);
  const [banTabSwitching, setBanTabSwitching] = useState(false);
  
  // Dates
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState<string>('12:00');
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [endTime, setEndTime] = useState<string>('14:00');

  // Problems
  const [selectedProblems, setSelectedProblems] = useState<Problem[]>([]);
  const [availableProblems, setAvailableProblems] = useState<Problem[]>([]);
  const [problemModalOpen, setProblemModalOpen] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        // Fetch all available problems (scope=manage to see hidden ones)
        const problems = await api.getProblems('manage');
        setAvailableProblems(problems);

        if (isEdit && id) {
          const contest = await api.getContest(id);
          if (contest) {
            setTitle(contest.title);
            setDescription(contest.description);
            // setRules(contest.rules || ''); // Deprecated
            setIsPrivate(contest.is_private);
            // Password is not returned by API for security, leave blank or handle if needed
            setAllowViewResults(contest.allow_view_results !== undefined ? contest.allow_view_results : true);
            setAllowMultipleJoins(contest.allow_multiple_joins || false);
            setBanTabSwitching(contest.ban_tab_switching || false);

            const start = new Date(contest.start_time);
            const end = new Date(contest.end_time);
            setStartDate(start);
            setStartTime(`${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}`);
            setEndDate(end);
            setEndTime(`${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`);

            // If contest has problems, we need to map them back to Problem objects
            if ((contest as any).problem_list) {
                const contestProblems = (contest as any).problem_list.map((cp: any) => cp.problem);
                setSelectedProblems(contestProblems);
            }
          }
        }
      } catch (err) {
        console.error(err);
        setError('載入失敗');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [id, isEdit]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    const start = new Date(startDate);
    const [startH, startM] = startTime.split(':').map(Number);
    start.setHours(startH, startM);

    const end = new Date(endDate);
    const [endH, endM] = endTime.split(':').map(Number);
    end.setHours(endH, endM);

    const payload = {
      title,
      description,
      // rules, // Deprecated
      is_public: !isPrivate, // Backend uses is_public
      password: isPrivate ? password : '',
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      allow_view_results: allowViewResults,
      allow_multiple_joins: allowMultipleJoins,
      ban_tab_switching: banTabSwitching,
      problems: selectedProblems.map(p => p.id) // Send IDs
    };

    try {
      if (isEdit && id) {
        await api.updateContest(id, payload);
      } else {
        await api.createContest(payload);
      }
      navigate('/teacher/contests');
    } catch (err: any) {
      setError(err.message || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const moveProblem = (index: number, direction: 'up' | 'down') => {
    const newProblems = [...selectedProblems];
    if (direction === 'up' && index > 0) {
      [newProblems[index], newProblems[index - 1]] = [newProblems[index - 1], newProblems[index]];
    } else if (direction === 'down' && index < newProblems.length - 1) {
      [newProblems[index], newProblems[index + 1]] = [newProblems[index + 1], newProblems[index]];
    }
    setSelectedProblems(newProblems);
  };

  const removeProblem = (index: number) => {
    const newProblems = [...selectedProblems];
    newProblems.splice(index, 1);
    setSelectedProblems(newProblems);
  };

  const addProblem = (problem: Problem) => {
    if (!selectedProblems.find(p => p.id === problem.id)) {
      setSelectedProblems([...selectedProblems, problem]);
    }
  };

  const handleCreateNewProblem = async () => {
    if (!id) {
      alert('請先儲存競賽');
      return;
    }
    
    const title = window.prompt('請輸入新題目標題：');
    if (!title) return;

    try {
        setSaving(true);
        const newProblem = await api.addContestProblem(id, null, title);
        
        // 導航到題目編輯頁面
        navigate(`/teacher/contests/${id}/problems/${newProblem.id}/edit`);
    } catch (err: any) {
        setError(err.message || '建立失敗');
    } finally {
        setSaving(false);
    }
  };

  // Announcements Logic
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [newAnnouncementTitle, setNewAnnouncementTitle] = useState('');
  const [newAnnouncementContent, setNewAnnouncementContent] = useState('');
  
  // Standings Logic
  const [standings, setStandings] = useState<any[]>([]);

  const fetchAnnouncements = async () => {
    if (id) {
        try {
            const data = await api.getContestAnnouncements(id);
            setAnnouncements(data);
        } catch (error) {
            console.error('Failed to fetch announcements', error);
        }
    }
  };

  const fetchStandings = async () => {
    if (id) {
        try {
            const data = await api.getContestStandings(id);
            setStandings(data);
        } catch (error) {
            console.error('Failed to fetch standings', error);
        }
    }
  };

  useEffect(() => {
    if (isEdit) {
        fetchAnnouncements();
        fetchStandings();
    }
  }, [isEdit, id]);

  const handleCreateAnnouncement = async () => {
    if (!id || !newAnnouncementTitle || !newAnnouncementContent) return;
    try {
        // We need a create announcement API. Assuming it exists or I need to add it to api.ts
        // Wait, api.ts doesn't have createAnnouncement yet?
        // Let's check api.ts. It has getContestAnnouncements.
        // I need to add createContestAnnouncement to api.ts first?
        // Or maybe I can use a generic request here if I don't want to switch files.
        // But better to add to api.ts.
        // For now, let's assume I'll add it.
        await api.createContestAnnouncement(id, { title: newAnnouncementTitle, content: newAnnouncementContent });
        setAnnouncementModalOpen(false);
        setNewAnnouncementTitle('');
        setNewAnnouncementContent('');
        fetchAnnouncements();
    } catch (error) {
        console.error('Failed to create announcement', error);
        alert('發布公告失敗');
    }
  };

  const handleDeleteAnnouncement = async (announcementId: string) => {
      if (!confirm('確定要刪除此公告嗎？')) return;
      try {
          await api.deleteContestAnnouncement(id!, announcementId);
          fetchAnnouncements();
      } catch (error) {
          console.error('Failed to delete announcement', error);
          alert('刪除公告失敗');
      }
  };

  if (loading) return <Loading />;

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <Button kind="ghost" renderIcon={ArrowLeft} onClick={() => navigate('/teacher/contests')}>
          返回列表
        </Button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1 style={{ marginTop: '1rem', fontSize: '2rem', fontWeight: 300 }}>
            {isEdit ? '編輯競賽' : '建立新競賽'}
            </h1>
            <Button renderIcon={Save} onClick={handleSave} disabled={saving}>
            {saving ? '儲存中...' : '儲存競賽'}
            </Button>
        </div>
      </div>

      {error && <InlineNotification kind="error" title="錯誤" subtitle={error} style={{ marginBottom: '1rem' }} />}

      <Tabs>
        <TabList aria-label="Contest settings tabs">
            <Tab>基本設定</Tab>
            <Tab>競賽規定</Tab>
            <Tab>題目管理</Tab>
            <Tab disabled={!isEdit}>公告管理</Tab>
            <Tab disabled={!isEdit}>分數管理</Tab>
        </TabList>
        <TabPanels>
            {/* Basic Info */}
            <TabPanel>
                <Grid style={{ padding: '1rem 0' }}>
                    <Column lg={10} md={8} sm={4}>
                    <Form>
                        <div style={{ marginBottom: '1.5rem' }}>
                        <TextInput
                            id="title"
                            labelText="競賽標題"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="輸入標題..."
                        />
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                        <TextArea
                            id="description"
                            labelText="描述"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="輸入競賽描述..."
                        />
                        </div>

                        <Grid style={{ padding: 0, marginBottom: '1.5rem' }}>
                        <Column lg={8} md={4} sm={4}>
                            <DatePicker 
                            datePickerType="single" 
                            value={startDate}
                            onChange={(dates: Date[]) => setStartDate(dates[0])}
                            >
                            <DatePickerInput id="start-date" labelText="開始日期" placeholder="mm/dd/yyyy" />
                            </DatePicker>
                            <TimePicker id="start-time" labelText="開始時間" value={startTime} onChange={(e) => setStartTime(e.target.value)}>
                            <TimePickerSelect id="start-time-select">
                                <SelectItem value="AM" text="AM" />
                                <SelectItem value="PM" text="PM" />
                            </TimePickerSelect>
                            </TimePicker>
                        </Column>
                        <Column lg={8} md={4} sm={4}>
                            <DatePicker 
                            datePickerType="single" 
                            value={endDate}
                            onChange={(dates: Date[]) => setEndDate(dates[0])}
                            >
                            <DatePickerInput id="end-date" labelText="結束日期" placeholder="mm/dd/yyyy" />
                            </DatePicker>
                            <TimePicker id="end-time" labelText="結束時間" value={endTime} onChange={(e) => setEndTime(e.target.value)}>
                            <TimePickerSelect id="end-time-select">
                                <SelectItem value="AM" text="AM" />
                                <SelectItem value="PM" text="PM" />
                            </TimePickerSelect>
                            </TimePicker>
                        </Column>
                        </Grid>

                        <div style={{ marginBottom: '1.5rem' }}>
                        <Toggle
                            id="is-private"
                            labelText="私有競賽 (需密碼)"
                            labelA="公開"
                            labelB="私有"
                            toggled={isPrivate}
                            onToggle={(checked) => setIsPrivate(checked)}
                        />
                        </div>

                        {isPrivate && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <TextInput
                            id="password"
                            labelText="競賽密碼"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="設定密碼..."
                            />
                        </div>
                        )}
                        
                    </Form>
                    </Column>
                </Grid>
            </TabPanel>

            {/* Rules */}
            <TabPanel>
                <Grid style={{ padding: '1rem 0' }}>
                    <Column lg={10} md={8} sm={4}>
                        <div style={{ marginBottom: '2rem' }}>
                            <h4 style={{ marginBottom: '1rem' }}>規則設定</h4>
                            
                            <div style={{ marginBottom: '1.5rem' }}>
                                <Toggle
                                    id="allow-view-results"
                                    labelText="允許查看結果 (Scoreboard)"
                                    labelA="關閉"
                                    labelB="開啟"
                                    toggled={allowViewResults}
                                    onToggle={(checked) => setAllowViewResults(checked)}
                                />
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <Toggle
                                    id="allow-multiple-joins"
                                    labelText="允許多次加入"
                                    labelA="禁止"
                                    labelB="允許"
                                    toggled={allowMultipleJoins}
                                    onToggle={(checked) => setAllowMultipleJoins(checked)}
                                />
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <Toggle
                                    id="ban-tab-switching"
                                    labelText="禁止切換分頁"
                                    labelA="不禁止"
                                    labelB="禁止"
                                    toggled={banTabSwitching}
                                    onToggle={(checked) => setBanTabSwitching(checked)}
                                />
                            </div>
                        </div>
                    </Column>
                </Grid>
            </TabPanel>

            {/* Problems */}
            <TabPanel>
                <Grid style={{ padding: '1rem 0' }}>
                    <Column lg={16} md={8} sm={4}>
                        <div style={{ backgroundColor: 'var(--cds-layer-01)', padding: '1rem', height: '100%' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h4 style={{ margin: 0 }}>競賽題目 ({selectedProblems.length})</h4>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <Button size="sm" renderIcon={Add} kind="secondary" onClick={handleCreateNewProblem} disabled={!id}>
                                    建立自訂題目
                                </Button>
                                <Button size="sm" renderIcon={Add} kind="tertiary" onClick={() => setProblemModalOpen(true)}>
                                    從題庫匯入
                                </Button>
                            </div>
                            </div>

                            {selectedProblems.length === 0 ? (
                            <div style={{ color: 'var(--cds-text-secondary)', textAlign: 'center', padding: '3rem', border: '1px dashed var(--cds-border-subtle)', borderRadius: '4px' }}>
                                <div style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>尚未加入任何題目</div>
                                <div style={{ marginBottom: '2rem', fontSize: '0.9rem' }}>您可以從現有題庫匯入題目，或是直接為此競賽建立全新的自訂題目。</div>
                                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                                    <Button renderIcon={Add} kind="secondary" onClick={handleCreateNewProblem} disabled={!id}>
                                        建立自訂題目
                                    </Button>
                                    <Button renderIcon={Add} kind="tertiary" onClick={() => setProblemModalOpen(true)}>
                                        從題庫匯入
                                    </Button>
                                </div>
                            </div>
                            ) : (
                                <DataTable
                                    rows={selectedProblems.map((p, i) => ({
                                        id: p.id.toString(),
                                        order: i + 1,
                                        title: p.title,
                                        display_id: p.display_id,
                                        difficulty: p.difficulty,
                                        created_by: p.created_by
                                    }))}
                                    headers={[
                                        { key: 'order', header: '#' },
                                        { key: 'title', header: '標題' },
                                        { key: 'difficulty', header: '難度' },
                                        { key: 'created_by', header: '作者' },
                                        { key: 'actions', header: '操作' }
                                    ]}
                                >
                                    {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
                                        <TableContainer>
                                            <Table {...getTableProps()}>
                                                <TableHead>
                                                    <TableRow>
                                                        {headers.map((header) => (
                                                            <TableHeader {...getHeaderProps({ header })} key={header.key}>
                                                                {header.header}
                                                            </TableHeader>
                                                        ))}
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {rows.map((row, index) => {
                                                        const problem = selectedProblems[index];
                                                        return (
                                                            <TableRow {...getRowProps({ row })} key={row.id}>
                                                                <TableCell>{row.cells[0].value}</TableCell>
                                                                <TableCell>
                                                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                                                        {row.cells[1].value}
                                                                        {problem.display_id && <Tag type="gray" size="sm" style={{ marginLeft: '0.5rem' }}>{problem.display_id}</Tag>}
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Tag type={problem.difficulty === 'hard' ? 'red' : problem.difficulty === 'medium' ? 'cyan' : 'green'}>
                                                                        {problem.difficulty === 'hard' ? '困難' : problem.difficulty === 'medium' ? '中等' : '簡單'}
                                                                    </Tag>
                                                                </TableCell>
                                                                <TableCell>{row.cells[3].value || 'Unknown'}</TableCell>
                                                                <TableCell>
                                                                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                                                                        <Button 
                                                                            hasIconOnly 
                                                                            kind="ghost" 
                                                                            size="sm" 
                                                                            renderIcon={ChevronUp} 
                                                                            iconDescription="上移"
                                                                            disabled={index === 0}
                                                                            onClick={() => moveProblem(index, 'up')}
                                                                        />
                                                                        <Button 
                                                                            hasIconOnly 
                                                                            kind="ghost" 
                                                                            size="sm" 
                                                                            renderIcon={ChevronDown} 
                                                                            iconDescription="下移"
                                                                            disabled={index === selectedProblems.length - 1}
                                                                            onClick={() => moveProblem(index, 'down')}
                                                                        />
                                                                        <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--cds-border-subtle)', margin: '0 0.5rem' }} />
                                                                        <Button
                                                                            size="sm"
                                                                            kind="tertiary"
                                                                            onClick={() => {
                                                                                // Navigate to contest internal edit page if saved (has contest id)
                                                                                // If not saved, warn user? Or just open generic edit?
                                                                                // Requirement: "Contest Internal Problem Edit Page"
                                                                                if (id) {
                                                                                    window.open(`/teacher/contests/${id}/problems/${problem.id}/edit`, '_blank');
                                                                                } else {
                                                                                    alert('請先儲存競賽以編輯題目');
                                                                                }
                                                                            }}
                                                                        >
                                                                            編輯
                                                                        </Button>
                                                                        <Button 
                                                                            hasIconOnly 
                                                                            kind="danger--ghost" 
                                                                            size="sm" 
                                                                            renderIcon={TrashCan} 
                                                                            iconDescription="移除"
                                                                            onClick={() => removeProblem(index)}
                                                                        />
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
                        </div>
                    </Column>
                </Grid>
            </TabPanel>

            {/* Announcements */}
            <TabPanel>
                <div style={{ padding: '1rem 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h4 style={{ margin: 0 }}>公告列表</h4>
                        <Button size="sm" renderIcon={Add} onClick={() => setAnnouncementModalOpen(true)}>
                            新增公告
                        </Button>
                    </div>
                    
                    {announcements.length === 0 ? (
                        <p style={{ color: 'var(--cds-text-secondary)' }}>目前沒有公告。</p>
                    ) : (
                        announcements.map(ann => (
                            <div key={ann.id} style={{ 
                                padding: '1rem', 
                                marginBottom: '1rem', 
                                backgroundColor: 'var(--cds-layer-01)',
                                border: '1px solid var(--cds-border-subtle)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <h5 style={{ fontWeight: 'bold', margin: 0 }}>{ann.title}</h5>
                                    <Button 
                                        hasIconOnly 
                                        kind="danger--ghost" 
                                        size="sm" 
                                        renderIcon={TrashCan} 
                                        iconDescription="刪除"
                                        onClick={() => handleDeleteAnnouncement(ann.id)}
                                    />
                                </div>
                                <p style={{ whiteSpace: 'pre-wrap', marginBottom: '0.5rem' }}>{ann.content}</p>
                                <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                                    發布於: {new Date(ann.created_at).toLocaleString()}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </TabPanel>

            {/* Scores */}
            <TabPanel>
                <div style={{ padding: '1rem 0' }}>
                    <h4 style={{ marginBottom: '1rem' }}>成績總覽</h4>
                    <DataTable
                        rows={standings.map((s, i) => ({
                            id: s.user.id.toString(),
                            rank: i + 1,
                            username: s.user.username,
                            email: s.user.email,
                            score: s.score,
                            joined_at: new Date(s.joined_at).toLocaleString()
                        }))}
                        headers={[
                            { key: 'rank', header: '排名' },
                            { key: 'username', header: '用戶名' },
                            { key: 'email', header: 'Email' },
                            { key: 'score', header: '總分' },
                            { key: 'joined_at', header: '加入時間' }
                        ]}
                    >
                        {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
                            <TableContainer>
                                <Table {...getTableProps()}>
                                    <TableHead>
                                        <TableRow>
                                            {headers.map((header) => (
                                                <TableHeader {...getHeaderProps({ header })} key={header.key}>
                                                    {header.header}
                                                </TableHeader>
                                            ))}
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {rows.map((row) => (
                                            <TableRow {...getRowProps({ row })} key={row.id}>
                                                {row.cells.map((cell) => (
                                                    <TableCell key={cell.id}>{cell.value}</TableCell>
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                    </DataTable>
                </div>
            </TabPanel>
        </TabPanels>
      </Tabs>

      {/* Problem Selection Modal */}
      <Modal
        open={problemModalOpen}
        modalHeading="從題庫匯入題目"
        passiveModal
        onRequestClose={() => setProblemModalOpen(false)}
        size="lg"
      >
        <div style={{ marginBottom: '1rem', color: 'var(--cds-text-secondary)' }}>
            點擊「匯入」將會把該題目複製一份到此競賽中。您可以自由修改競賽中的題目副本，而不會影響原始題目。
        </div>
        <DataTable
          rows={availableProblems.map(p => ({ ...p, id: p.id.toString() }))}
          headers={[
            { key: 'id', header: 'ID' },
            { key: 'title', header: '標題' },
            { key: 'difficulty', header: '難度' },
            { key: 'created_by', header: '作者' },
            { key: 'actions', header: '操作' }
          ]}
        >
          {({ rows, headers, getTableProps, getHeaderProps, getRowProps, onInputChange }) => (
            <TableContainer>
              <TableToolbar>
                <TableToolbarContent>
                  <TableToolbarSearch onChange={(e) => onInputChange(e as any)} />
                </TableToolbarContent>
              </TableToolbar>
              <Table {...getTableProps()}>
                <TableHead>
                  <TableRow>
                    {headers.map((header) => (
                      <TableHeader {...getHeaderProps({ header })}>{header.header}</TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => {
                    const problem = availableProblems.find(p => p.id.toString() === row.id);
                    const isSelected = selectedProblems.some(p => p.id === problem?.id);
                    return (
                      <TableRow {...getRowProps({ row })}>
                        <TableCell>{row.cells[0].value}</TableCell>
                        <TableCell>{row.cells[1].value}</TableCell>
                        <TableCell>
                            <Tag type={problem?.difficulty === 'hard' ? 'red' : problem?.difficulty === 'medium' ? 'cyan' : 'green'}>
                                {problem?.difficulty}
                            </Tag>
                        </TableCell>
                        <TableCell>{problem?.created_by}</TableCell>
                        <TableCell>
                          <Button 
                            size="sm" 
                            kind={isSelected ? "ghost" : "primary"}
                            disabled={isSelected}
                            onClick={() => {
                                if (problem) {
                                    // Simplified confirmation or batch add later
                                    // For now, keep single add but make it clear
                                    addProblem(problem);
                                }
                            }}
                          >
                            {isSelected ? '已匯入' : '匯入'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>
      </Modal>

      {/* Announcement Creation Modal */}
      <Modal
        open={announcementModalOpen}
        modalHeading="發布新公告"
        primaryButtonText="發布"
        secondaryButtonText="取消"
        onRequestClose={() => setAnnouncementModalOpen(false)}
        onRequestSubmit={handleCreateAnnouncement}
      >
        <div style={{ marginBottom: '1rem' }}>
            <TextInput
                id="announcement-title"
                labelText="標題"
                value={newAnnouncementTitle}
                onChange={(e) => setNewAnnouncementTitle(e.target.value)}
                placeholder="輸入公告標題..."
            />
        </div>
        <div style={{ marginBottom: '1rem' }}>
            <TextArea
                id="announcement-content"
                labelText="內容"
                value={newAnnouncementContent}
                onChange={(e) => setNewAnnouncementContent(e.target.value)}
                placeholder="輸入公告內容..."
                rows={5}
            />
        </div>
      </Modal>
    </div>
  );
};

export default TeacherContestEditPage;
