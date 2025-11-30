import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useContestNavigationGuard } from '../hooks/useContestNavigationGuard';
import {
  Tile,
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
  Tag,
  Tabs,
  Tab,
  TabList,
  TabPanels,
  TabPanel,
  Loading,
  ProgressBar,
  Button,
  TextInput,
  TextArea,
  Modal,
  InlineNotification
} from '@carbon/react';
import { Time, Add, TrashCan } from '@carbon/icons-react';
import { api } from '../services/api';
import type { Contest, Problem } from '../services/api';
import ContestQuestionList from '../components/ContestQuestionList';

const ContestDashboardPage = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  
  const [contest, setContest] = useState<Contest | null>(null);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Teacher/Admin State
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [password, setPassword] = useState('');
  const [allowViewResults, setAllowViewResults] = useState(true);
  const [allowMultipleJoins, setAllowMultipleJoins] = useState(false);
  const [banTabSwitching, setBanTabSwitching] = useState(false);

  // Problem Management State
  const [selectedProblems, setSelectedProblems] = useState<Problem[]>([]);
  const [availableProblems, setAvailableProblems] = useState<Problem[]>([]);
  const [problemModalOpen, setProblemModalOpen] = useState(false);

  // Announcement Management State
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [newAnnouncementTitle, setNewAnnouncementTitle] = useState('');
  const [newAnnouncementContent, setNewAnnouncementContent] = useState('');

  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        setCurrentUser(JSON.parse(userStr));
      } catch (e) {
        console.error('Failed to parse user from local storage', e);
      }
    }
  }, []);

  const isTeacherOrAdmin = 
    contest?.current_user_role === 'teacher' || 
    contest?.current_user_role === 'admin' ||
    currentUser?.role === 'teacher' ||
    currentUser?.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'management' && isTeacherOrAdmin) {
      setSelectedIndex(3);
    } else if (tab === 'qa') {
      setSelectedIndex(2);
    } else if (tab === 'announcements') {
      setSelectedIndex(1);
    } else {
      setSelectedIndex(0);
    }
  }, [searchParams, isTeacherOrAdmin]);

  const handleTabChange = (evt: { selectedIndex: number }) => {
    setSelectedIndex(evt.selectedIndex);
  };

  useContestNavigationGuard(contestId, contest?.status === 'running');
  
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (contestId) {
      fetchData(contestId);
      // Poll for updates every minute
      const interval = setInterval(() => fetchData(contestId), 60000);
      return () => clearInterval(interval);
    }
  }, [contestId]);

  useEffect(() => {
    if (contest) {
      const timer = setInterval(() => {
        updateTime(contest);
      }, 1000);
      updateTime(contest);
      
      // Initialize edit form state
      setTitle(contest.title);
      setDescription(contest.description || '');
      setStartTime(contest.start_time.slice(0, 16));
      setEndTime(contest.end_time.slice(0, 16));
      setIsPublic(contest.is_public);
      setPassword(contest.password || '');
      setAllowViewResults(!!contest.allow_view_results);
      setAllowMultipleJoins(!!contest.allow_multiple_joins);
      setBanTabSwitching(!!contest.ban_tab_switching);

      // Initialize selected problems
      const problems = (contest as any).problems?.map((p: any) => p.problem) || [];
      setSelectedProblems(problems);

      return () => clearInterval(timer);
    }
  }, [contest]);

  const fetchData = async (id: string) => {
    try {
      const [contestData, announcementsData] = await Promise.all([
        api.getContest(id),
        api.getContestAnnouncements(id)
      ]);
      
      setContest(contestData || null);
      setAnnouncements(announcementsData);
    } catch (error) {
      console.error('Failed to fetch contest data', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableProblems = async () => {
    try {
      const data = await api.getProblems();
      setAvailableProblems(data);
    } catch (err) {
      console.error(err);
    }
  };

  const updateTime = (contest: Contest) => {
    const now = new Date().getTime();
    const start = new Date(contest.start_time).getTime();
    const end = new Date(contest.end_time).getTime();
    
    if (now < start) {
      setTimeLeft('尚未開始');
      setProgress(0);
    } else if (now > end) {
      setTimeLeft('已結束');
      setProgress(100);
    } else {
      const total = end - start;
      const elapsed = now - start;
      const remaining = end - now;
      
      const hours = Math.floor(remaining / (1000 * 60 * 60));
      const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
      
      setTimeLeft(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      setProgress((elapsed / total) * 100);
    }
  };

  const handleSaveSettings = async () => {
    if (!contestId) return;
    try {
      setSaving(true);
      setError(null);
      const data = {
        title,
        description,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        is_public: isPublic,
        password: isPublic ? '' : password,
        allow_view_results: allowViewResults,
        allow_multiple_joins: allowMultipleJoins,
        ban_tab_switching: banTabSwitching,
        problems: selectedProblems.map(p => parseInt(p.id))
      };

      await api.updateContest(contestId, data);
      fetchData(contestId);
      alert('設定已儲存');
    } catch (err) {
      console.error(err);
      setError('Failed to save contest settings');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAnnouncement = async () => {
    if (!contestId || !newAnnouncementTitle || !newAnnouncementContent) return;
    try {
        await api.createContestAnnouncement(contestId, {
            title: newAnnouncementTitle,
            content: newAnnouncementContent
        });
        setAnnouncementModalOpen(false);
        setNewAnnouncementTitle('');
        setNewAnnouncementContent('');
        fetchData(contestId);
    } catch (err) {
        console.error('Failed to create announcement', err);
    }
  };

  const handleDeleteAnnouncement = async (announcementId: string) => {
    if (!contestId || !confirm('確定要刪除此公告？')) return;
    try {
        await api.deleteContestAnnouncement(contestId, announcementId);
        fetchData(contestId);
    } catch (err) {
        console.error('Failed to delete announcement', err);
    }
  };

  const addProblem = (problem: Problem) => {
    if (!selectedProblems.find(p => p.id === problem.id)) {
      setSelectedProblems([...selectedProblems, problem]);
    }
  };

  const removeProblem = (problemId: string) => {
    setSelectedProblems(selectedProblems.filter(p => p.id !== problemId));
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'green';
      case 'medium': return 'cyan';
      case 'hard': return 'red';
      default: return 'gray';
    }
  };

  const getDifficultyLabel = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return '簡單';
      case 'medium': return '中等';
      case 'hard': return '困難';
      default: return '未知';
    }
  };

  const problemHeaders = [
    { key: 'order', header: '#' },
    { key: 'title', header: '題目' },
    { key: 'difficulty', header: '難度' },
    { key: 'score', header: '分數' },
    { key: 'status', header: '狀態' },
  ];

  // Backend may return 'problems' or 'problem_list' depending on serializer
  const contestProblems = (contest as any)?.problems || (contest as any)?.problem_list || [];
  
  const problemRows = contestProblems.map((problem: any, index: number) => {
    let statusTag = <Tag type="gray">未解</Tag>;
    if (problem.user_status === 'AC') {
      statusTag = <Tag type="green">已通過</Tag>;
    } else if (problem.user_status === 'attempted') {
      statusTag = <Tag type="magenta">嘗試中</Tag>;
    }

    return {
      id: problem.problem.id.toString(), // Use actual problem ID instead of index
      order: `${index + 1}`,
      title: problem.problem.title,
      difficulty: (
        <Tag type={getDifficultyColor(problem.problem.difficulty)}>
          {getDifficultyLabel(problem.problem.difficulty)}
        </Tag>
      ),
      score: problem.score,
      status: statusTag,
    };
  });

  if (loading) return <Loading />;
  if (!contest) return <div>Contest not found</div>;





  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      
      {/* Contest Header & Status */}
      <Tile style={{ marginBottom: '2rem', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{contest.title}</h1>
            <div style={{ display: 'flex', gap: '1rem', color: 'var(--cds-text-secondary)' }}>
                <span><Time /> {new Date(contest.start_time).toLocaleString()} ~ {new Date(contest.end_time).toLocaleString()}</span>
            </div>
            {isTeacherOrAdmin && (
                <div style={{ marginTop: '1rem' }}>
                    <Tag type="blue">Role: {contest.current_user_role}</Tag>
                </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginBottom: '0.25rem' }}>剩餘時間</div>
            <div style={{ fontSize: '2.5rem', fontWeight: 'bold', fontFamily: 'monospace', color: timeLeft === '已結束' ? 'red' : 'var(--cds-text-primary)' }}>
              {timeLeft}
            </div>
          </div>
        </div>
        <ProgressBar value={progress} max={100} label="競賽進度" />
      </Tile>

      <Tabs selectedIndex={selectedIndex} onChange={handleTabChange}>
        <TabList aria-label="Contest tabs">
          <Tab>題目列表</Tab>
          <Tab>公告 ({announcements.length})</Tab>
          <Tab>提問與討論</Tab>
          {isTeacherOrAdmin && <Tab>管理</Tab>}
        </TabList>
        <TabPanels>
          <TabPanel>
            <div style={{ marginTop: '1rem' }}>
              <DataTable rows={problemRows} headers={problemHeaders}>
                {({ rows, headers, getHeaderProps, getTableProps, getRowProps }) => (
                  <TableContainer title="競賽題目">
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
                          <TableRow 
                            {...getRowProps({ row })} 
                            key={row.id}
                            onClick={() => navigate(`/contests/${contestId}/problems/${row.id}`)}
                            style={{ cursor: 'pointer' }}
                          >
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
          <TabPanel>
            <div style={{ marginTop: '1rem' }}>
              {isTeacherOrAdmin && (
                  <div style={{ marginBottom: '1rem' }}>
                      <Button renderIcon={Add} size="sm" onClick={() => setAnnouncementModalOpen(true)}>
                          發布公告
                      </Button>
                  </div>
              )}
              {announcements.map(ann => (
                <Tile key={ann.id} style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <h4 style={{ fontWeight: 'bold' }}>{ann.title}</h4>
                    <div>
                        <span style={{ color: 'gray', fontSize: '0.875rem', marginRight: '1rem' }}>{new Date(ann.created_at).toLocaleString()}</span>
                        {isTeacherOrAdmin && (
                            <Button kind="danger--ghost" size="sm" renderIcon={TrashCan} onClick={() => handleDeleteAnnouncement(ann.id)} />
                        )}
                    </div>
                  </div>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{ann.content}</p>
                  <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'gray' }}>
                    發布者: {ann.created_by?.username || 'System'}
                  </div>
                </Tile>
              ))}
              {announcements.length === 0 && <p>目前沒有公告。</p>}
            </div>
          </TabPanel>
          <TabPanel>
            <div style={{ marginTop: '1rem' }}>
              <ContestQuestionList 
                contestId={contestId || ''}
                problemId="" 
                isTeacherOrAdmin={isTeacherOrAdmin}
              />
            </div>
          </TabPanel>
          {isTeacherOrAdmin && (
              <TabPanel>
                  <div style={{ marginTop: '1rem' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                          {/* Left Column: Settings */}
                          <div>
                              <h4 style={{ marginBottom: '1rem' }}>基本設定</h4>
                              {error && (
                                  <div style={{ marginBottom: '1rem' }}>
                                      <InlineNotification
                                          kind="error"
                                          title="Error"
                                          subtitle={error}
                                          onClose={() => setError(null)}
                                      />
                                  </div>
                              )}
                              <div style={{ marginBottom: '1rem' }}>
                                  <TextInput
                                      id="title"
                                      labelText="競賽標題"
                                      value={title}
                                      onChange={(e) => setTitle(e.target.value)}
                                  />
                              </div>
                              <div style={{ marginBottom: '1rem' }}>
                                  <TextArea
                                      id="description"
                                      labelText="描述"
                                      value={description}
                                      onChange={(e) => setDescription(e.target.value)}
                                  />
                              </div>
                              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                  <div style={{ flex: 1 }}>
                                      <label className="cds--label">開始時間</label>
                                      <input
                                          type="datetime-local"
                                          className="cds--text-input"
                                          value={startTime}
                                          onChange={(e) => setStartTime(e.target.value)}
                                      />
                                  </div>
                                  <div style={{ flex: 1 }}>
                                      <label className="cds--label">結束時間</label>
                                      <input
                                          type="datetime-local"
                                          className="cds--text-input"
                                          value={endTime}
                                          onChange={(e) => setEndTime(e.target.value)}
                                      />
                                  </div>
                              </div>
                              <Button onClick={handleSaveSettings} disabled={saving}>
                                  {saving ? '儲存中...' : '儲存設定'}
                              </Button>
                          </div>

                          {/* Right Column: Problems & Actions */}
                          <div>
                              <h4 style={{ marginBottom: '1rem' }}>題目管理</h4>
                              <div style={{ marginBottom: '1rem' }}>
                                  <Button 
                                    renderIcon={Add} 
                                    size="sm" 
                                    kind="tertiary" 
                                    onClick={() => {
                                        fetchAvailableProblems();
                                        setProblemModalOpen(true);
                                    }}
                                  >
                                      新增題目
                                  </Button>
                              </div>
                              <DataTable
                                  rows={selectedProblems.map((p, i) => ({ ...p, id: p.id.toString(), order: i + 1 }))}
                                  headers={[
                                      { key: 'order', header: '#' },
                                      { key: 'title', header: '標題' },
                                      { key: 'actions', header: '操作' }
                                  ]}
                              >
                                  {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
                                      <TableContainer>
                                          <Table {...getTableProps()} size="sm">
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
                                                              <TableCell key={cell.id}>
                                                                  {cell.info.header === 'actions' ? (
                                                                      <Button
                                                                          kind="danger--ghost"
                                                                          size="sm"
                                                                          renderIcon={TrashCan}
                                                                          onClick={() => removeProblem(row.id)}
                                                                      />
                                                                  ) : cell.value}
                                                              </TableCell>
                                                          ))}
                                                      </TableRow>
                                                  ))}
                                              </TableBody>
                                          </Table>
                                      </TableContainer>
                                  )}
                              </DataTable>

                              <h4 style={{ marginTop: '2rem', marginBottom: '1rem' }}>其他操作</h4>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                  <Button kind="secondary" onClick={() => navigate(`/contests/${contestId}/standings`)}>
                                      查看成績總覽
                                  </Button>
                                  {/* Add more admin actions here */}
                              </div>
                          </div>
                      </div>
                  </div>
              </TabPanel>
          )}
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
        <DataTable
          rows={availableProblems.map(p => ({ ...p, id: p.id.toString() }))}
          headers={[
            { key: 'id', header: 'ID' },
            { key: 'title', header: '標題' },
            { key: 'difficulty', header: '難度' },
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
                      <TableHeader {...getHeaderProps({ header })} key={header.key}>{header.header}</TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => {
                    const problem = availableProblems.find(p => p.id.toString() === row.id);
                    const isSelected = selectedProblems.some(p => p.id === problem?.id);
                    return (
                      <TableRow {...getRowProps({ row })} key={row.id}>
                        <TableCell>{row.cells[0].value}</TableCell>
                        <TableCell>{row.cells[1].value}</TableCell>
                        <TableCell>{problem?.difficulty}</TableCell>
                        <TableCell>
                          <Button 
                            size="sm" 
                            kind={isSelected ? "ghost" : "primary"}
                            disabled={isSelected}
                            onClick={() => {
                                if (problem) {
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

export default ContestDashboardPage;
