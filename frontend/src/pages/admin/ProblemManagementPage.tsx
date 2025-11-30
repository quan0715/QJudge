import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Add,
  Edit,
  View,
  TrashCan,
  Upload
} from '@carbon/icons-react';
import {
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
  Tag,
  InlineLoading,
  Tabs,
  Tab,
  TabList,
  TabPanels,
  TabPanel
} from '@carbon/react';
import { authFetch } from '@/services/auth';
import ProblemImportModal from '@/components/ProblemImportModal';

interface Problem {
  id: number;
  title: string;
  difficulty: string;
  submission_count: number;
  accepted_count: number;
  is_visible: boolean;
  created_by: string;
  created_at: string;

  is_practice_visible?: boolean;
  created_in_contest?: any;
}

const ProblemManagementPage = () => {
  const navigate = useNavigate();
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTab, setSelectedTab] = useState(0);
  const [importModalOpen, setImportModalOpen] = useState(false);

  const [currentUser, setCurrentUser] = useState<{ username: string; role: string } | null>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        setCurrentUser(JSON.parse(userStr));
      } catch (e) {
        console.error("Failed to parse user data", e);
      }
    }
    fetchProblems();
  }, []);

  const fetchProblems = async () => {
    setLoading(true);
    setError('');
    
    try {
      const res = await authFetch('/api/v1/problems/?scope=manage');
      
      if (res.ok) {
        const data = await res.json();
        setProblems(data.results || data);
      } else {
        setError('Failed to load problems');
      }
    } catch (err) {
      setError('Failed to load problems');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleImportProblem = async (problemData: any) => {
    try {
      const res = await authFetch('/api/v1/problems/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(problemData)
      });

      if (res.ok) {
        const createdProblem = await res.json();
        // Refresh the problem list
        fetchProblems();
        return createdProblem.id; // Return the problem ID
      } else {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to create problem');
      }
    } catch (error: any) {
      throw error;
    }
  };

  const getDifficultyTag = (difficulty: string) => {
    const config = {
      'easy': { label: '簡單', type: 'green' },
      'medium': { label: '中等', type: 'cyan' },
      'hard': { label: '困難', type: 'red' }
    } as const;
    
    const { label, type } = config[difficulty as keyof typeof config] || { label: difficulty, type: 'gray' };
    return <Tag type={type as any}>{label}</Tag>;
  };

  const getAcceptanceRate = (problem: Problem) => {
    if (problem.submission_count === 0) return '0%';
    return `${((problem.accepted_count / problem.submission_count) * 100).toFixed(1)}%`;
  };

  const headers = [
    { key: 'id', header: 'ID' },
    { key: 'title', header: '標題' },
    { key: 'difficulty', header: '難度' },
    { key: 'type', header: '類型' },
    { key: 'stats', header: '統計' },
    { key: 'visibility', header: '狀態' },
    { key: 'created_by', header: '作者' },
    { key: 'created_at', header: '建立時間' },
    { key: 'actions', header: '操作' },
  ];

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
        <InlineLoading description="Loading problems..." />
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
          題目管理
        </h1>
        <p style={{ color: 'var(--cds-text-secondary)' }}>
          管理您建立的題目
        </p>
      </div>

      {error && (
        <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#fff1f1', border: '1px solid #da1e28', borderRadius: '4px', color: '#da1e28' }}>
          {error}
        </div>
      )}

      <Tabs selectedIndex={selectedTab} onChange={({ selectedIndex }) => setSelectedTab(selectedIndex)}>
        <TabList aria-label="Problem type tabs">
          <Tab>全部題目 ({problems.length})</Tab>
          <Tab>練習題目 ({problems.filter(p => p.is_practice_visible).length})</Tab>
          <Tab>競賽題目 ({problems.filter(p => !p.is_practice_visible).length})</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>{renderTable(problems)}</TabPanel>
          <TabPanel>{renderTable(problems.filter(p => p.is_practice_visible))}</TabPanel>
          <TabPanel>{renderTable(problems.filter(p => !p.is_practice_visible))}</TabPanel>
        </TabPanels>
      </Tabs>

      <ProblemImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={handleImportProblem}
      />
    </div>
  );

  function renderTable(filteredProblems: Problem[]) {
    return (
      <DataTable rows={filteredProblems.map(p => ({ ...p, id: p.id.toString() }))} headers={headers}>
        {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
          <TableContainer>
            <TableToolbar>
              <TableToolbarContent>
                <TableToolbarSearch placeholder="搜尋題目..." />
                <Button
                  kind="secondary"
                  renderIcon={Upload}
                  onClick={() => setImportModalOpen(true)}
                >
                  匯入 YAML
                </Button>
                <Button
                  kind="primary"
                  renderIcon={Add}
                  onClick={() => navigate('/admin/problems/new')}
                >
                  新增題目
                </Button>
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()}>
              <TableHead>
                <TableRow>
                  {headers.map((header) => {
                    const { key, ...headerProps } = getHeaderProps({ header });
                    return (
                      <TableHeader key={key} {...headerProps}>
                        {header.header}
                      </TableHeader>
                    );
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const problem = problems.find(p => p.id === Number(row.id));
                  if (!problem) return null;

                  const canEdit = currentUser?.role === 'admin' || problem.created_by === currentUser?.username;

                  const { key, ...rowProps } = getRowProps({ row });
                  return (
                    <TableRow key={key} {...rowProps}>
                      <TableCell>{problem.id}</TableCell>
                      <TableCell>
                        <div style={{ fontWeight: 500 }}>{problem.title}</div>
                      </TableCell>
                      <TableCell>{getDifficultyTag(problem.difficulty)}</TableCell>
                      <TableCell>
                        {!problem.is_practice_visible ? (
                          <Tag type="purple">競賽</Tag>
                        ) : (
                          <Tag type="blue">練習</Tag>
                        )}
                      </TableCell>
                      <TableCell>
                        <div style={{ fontSize: '0.875rem', display: 'flex', gap: '1rem' }}>
                          <span>提交: <strong>{problem.submission_count}</strong></span>
                          <span>通過: <strong>{problem.accepted_count}</strong></span>
                          <span>通過率: <strong>{getAcceptanceRate(problem)}</strong></span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {problem.is_visible ? (
                          <Tag type="green">可見</Tag>
                        ) : (
                          <Tag type="gray">隱藏</Tag>
                        )}
                      </TableCell>
                      <TableCell>{problem.created_by || '-'}</TableCell>
                      <TableCell>{formatDate(problem.created_at)}</TableCell>
                      <TableCell>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <Button
                            kind="ghost"
                            size="sm"
                            renderIcon={View}
                            iconDescription="查看"
                            hasIconOnly
                            onClick={() => navigate(`/problems/${problem.id}`)}
                          />
                          {canEdit && (
                            <>
                              <Button
                                kind="ghost"
                                size="sm"
                                renderIcon={Edit}
                                iconDescription="編輯"
                                hasIconOnly
                                onClick={() => navigate(`/admin/problems/${problem.id}/edit`)}
                              />
                              <Button
                                kind="danger--ghost"
                                size="sm"
                                renderIcon={TrashCan}
                                iconDescription="刪除"
                                hasIconOnly
                                  onClick={async () => {
                                    if (confirm(`確定要刪除題目「${problem.title}」嗎？`)) {
                                      try {
                                        const res = await authFetch(`/api/v1/problems/${problem.id}/`, {
                                          method: 'DELETE'
                                        });
                                      
                                      if (res.ok) {
                                        // Refresh the list
                                        fetchProblems();
                                      } else {
                                        alert('刪除失敗');
                                      }
                                    } catch (err) {
                                      alert('刪除失敗');
                                      console.error(err);
                                    }
                                  }
                                }}
                              />
                            </>
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
    );
  }
};

export default ProblemManagementPage;
