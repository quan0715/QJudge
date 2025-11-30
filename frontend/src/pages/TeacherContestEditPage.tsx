import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  TextInput,
  TextArea,
  Button,
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
  Tabs,
  Tab,
  TabList,
  TabPanels,
  TabPanel
} from '@carbon/react';
import { Add, TrashCan } from '@carbon/icons-react';
import { api } from '../services/api';
import type { Problem } from '../services/api';

const TeacherContestEditPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // General Settings
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [password, setPassword] = useState('');
  const [allowViewResults, setAllowViewResults] = useState(true);
  const [allowMultipleJoins, setAllowMultipleJoins] = useState(false);
  const [banTabSwitching, setBanTabSwitching] = useState(false);

  // Problems Logic
  const [selectedProblems, setSelectedProblems] = useState<Problem[]>([]);
  const [availableProblems, setAvailableProblems] = useState<Problem[]>([]);
  const [problemModalOpen, setProblemModalOpen] = useState(false);

  // Announcements Logic
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [newAnnouncementTitle, setNewAnnouncementTitle] = useState('');
  const [newAnnouncementContent, setNewAnnouncementContent] = useState('');
  
  // Standings Logic
  const [standings, setStandings] = useState<any[]>([]);

  useEffect(() => {
    if (isEdit) {
      fetchContest();
      fetchAnnouncements();
      fetchStandings();
    }
    fetchAvailableProblems();
  }, [isEdit, id]);

  const fetchContest = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data: any = await api.getContest(id);
      setTitle(data.title || '');
      setDescription(data.description || '');
      setStartTime(data.start_time ? data.start_time.slice(0, 16) : '');
      setEndTime(data.end_time ? data.end_time.slice(0, 16) : '');
      setIsPublic(!!data.is_public);
      setPassword(data.password || '');
      setAllowViewResults(!!data.allow_view_results);
      setAllowMultipleJoins(!!data.allow_multiple_joins);
      setBanTabSwitching(!!data.ban_tab_switching);
      
      // Fetch contest problems
      if (data.problems) {
        setSelectedProblems(data.problems.map((p: any) => p.problem));
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load contest');
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

  const handleSave = async () => {
    try {
      setSaving(true);
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
        problems: selectedProblems.map(p => p.id)
      };

      if (isEdit && id) {
        await api.updateContest(id, data);
      } else {
        await api.createContest(data);
        navigate('/teacher/contests');
      }
    } catch (err) {
      console.error(err);
      setError('Failed to save contest');
    } finally {
      setSaving(false);
    }
  };

  const addProblem = (problem: Problem) => {
    if (!selectedProblems.find(p => p.id === problem.id)) {
      setSelectedProblems([...selectedProblems, problem]);
    }
  };

  const removeProblem = (problemId: number) => {
    setSelectedProblems(selectedProblems.filter(p => p.id !== problemId));
  };

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
            const data: any = await api.getContestStandings(id);
            // Handle new API format
            if (data.standings && Array.isArray(data.standings)) {
                setStandings(data.standings);
            } else if (Array.isArray(data)) {
                setStandings(data);
            } else {
                setStandings([]);
            }
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
        await api.createContestAnnouncement(id, {
            title: newAnnouncementTitle,
            content: newAnnouncementContent
        });
        setAnnouncementModalOpen(false);
        setNewAnnouncementTitle('');
        setNewAnnouncementContent('');
        fetchAnnouncements();
    } catch (err) {
        console.error('Failed to create announcement', err);
    }
  };

  const handleDeleteAnnouncement = async (announcementId: string) => {
    if (!id || !confirm('確定要刪除此公告？')) return;
    try {
        await api.deleteContestAnnouncement(id, announcementId);
        fetchAnnouncements();
    } catch (err) {
        console.error('Failed to delete announcement', err);
    }
  };
  
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Tabs>
            <TabList>
                <Tab>一般設定</Tab>
                <Tab>題目管理</Tab>
                <Tab>成績總覽</Tab>
                <Tab>公告</Tab>
            </TabList>
            <TabPanels>
            <TabPanel>
                <div style={{ maxWidth: '800px' }}>
                    {loading && <div style={{ marginBottom: '1rem' }}>Loading...</div>}
                    {error && <div style={{ marginBottom: '1rem', color: 'red' }}>{error}</div>}
                    <div style={{ marginBottom: '1rem' }}>
                        <TextInput
                            id="title"
                            labelText="競賽標題"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="輸入競賽標題..."
                        />
                    </div>
                    <div style={{ marginBottom: '1rem' }}>
                        <TextArea
                            id="description"
                            labelText="描述"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="輸入競賽描述..."
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
                    {/* Simplified Toggles for now */}
                    <div style={{ marginBottom: '2rem' }}>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? '儲存中...' : '儲存設定'}
                        </Button>
                    </div>
                </div>
            </TabPanel>
            <TabPanel>
                <div style={{ marginBottom: '1rem' }}>
                    <Button renderIcon={Add} onClick={() => setProblemModalOpen(true)}>
                        新增題目
                    </Button>
                </div>
                <DataTable
                    rows={selectedProblems.map((p, i) => ({ ...p, id: p.id.toString(), order: i + 1 }))}
                    headers={[
                        { key: 'order', header: '排序' },
                        { key: 'title', header: '標題' },
                        { key: 'difficulty', header: '難度' },
                        { key: 'actions', header: '操作' }
                    ]}
                >
                    {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
                        <TableContainer title="已選題目">
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
                                                <TableCell key={cell.id}>
                                                    {cell.info.header === 'actions' ? (
                                                        <Button
                                                            kind="danger--ghost"
                                                            size="sm"
                                                            renderIcon={TrashCan}
                                                            onClick={() => removeProblem(parseInt(row.id))}
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
            </TabPanel>
            <TabPanel>
                <DataTable
                        rows={standings.map((s, i) => ({
                            id: s.user.id.toString(),
                            rank: i + 1,
                            username: s.user.username,
                            email: s.user.email,
                            score: s.solved !== undefined ? s.solved : s.score, // Handle both new (solved) and old (score)
                            joined_at: new Date(s.joined_at).toLocaleString()
                        }))}
                        headers={[
                            { key: 'rank', header: '排名' },
                            { key: 'username', header: '用戶名' },
                            { key: 'email', header: 'Email' },
                            { key: 'score', header: '解題數' },
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
            </TabPanel>
            <TabPanel>
                <div style={{ marginBottom: '1rem' }}>
                    <Button renderIcon={Add} onClick={() => setAnnouncementModalOpen(true)}>
                        發布公告
                    </Button>
                </div>
                {announcements.map((ann) => (
                    <div key={ann.id} style={{ border: '1px solid var(--cds-ui-03)', padding: '1rem', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <h5>{ann.title}</h5>
                            <Button kind="danger--ghost" size="sm" renderIcon={TrashCan} onClick={() => handleDeleteAnnouncement(ann.id)} />
                        </div>
                        <p>{ann.content}</p>
                        <small style={{ color: 'var(--cds-text-secondary)' }}>{new Date(ann.created_at).toLocaleString()}</small>
                    </div>
                ))}
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
                        <TableCell>
                            {problem?.difficulty}
                        </TableCell>
                        <TableCell>{problem?.created_by}</TableCell>
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

export default TeacherContestEditPage;
