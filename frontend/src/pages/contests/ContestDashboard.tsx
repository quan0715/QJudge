import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  Button, 
  Tag, 
  Loading,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  Modal
} from '@carbon/react';
import { Play, Time } from '@carbon/icons-react';
import ReactMarkdown from 'react-markdown';

import remarkGfm from 'remark-gfm';
import { api } from '@/services/api';
import type { ContestDetail } from '@/models/contest';
import { type ProblemInfo, type StandingRow } from '@/components/contest/ContestScoreboard';
import { useSearchParams } from 'react-router-dom';
import { SubmissionDetailModal } from '@/components/contest/SubmissionDetailModal';
import { StatusBadge } from '@/components/common/StatusBadge';
import type { StatusType } from '@/components/common/StatusBadge';
import SurfaceSection from '@/components/contest/layout/SurfaceSection';
import ContainerCard from '@/components/contest/layout/ContainerCard';
import SubmissionTrendChart from '@/components/contest/SubmissionTrendChart';
import { useLocation } from 'react-router-dom';

const ContestDashboard = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Personal stats state
  const [myRank, setMyRank] = useState<StandingRow | null>(null);
  const [problems, setProblems] = useState<ProblemInfo[]>([]);
  const [mySubmissions, setMySubmissions] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [lockModalOpen, setLockModalOpen] = useState(false);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        setCurrentUser(JSON.parse(userStr));
      } catch (e) {
        console.error('Failed to parse user', e);
      }
    }
  }, []);

  useEffect(() => {
    if (contestId) {
      loadContest();
      if (currentUser) {
        loadPersonalStats();
      }
    }
  }, [contestId, currentUser]);

  const loadContest = async () => {
    try {
      setLoading(true);
      const data = await api.getContest(contestId!);
      setContest(data || null);
    } catch (error) {
      console.error('Failed to load contest', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPersonalStats = async () => {
    if (!contestId || !currentUser) return;
    try {
      // Load standings to find rank
      const standingsData = await api.getScoreboard(contestId);
      if (standingsData && standingsData.standings && Array.isArray(standingsData.standings)) {
        const myEntry = standingsData.standings.find((s: any) => s.user?.username === currentUser.username);
        setMyRank(myEntry);
        setProblems(standingsData.problems || []);
      }

      // Load submissions
      const submissions = await api.getSubmissions({ contest_id: contestId });
      const mySubs = submissions.filter((s: any) => s.user?.username === currentUser.username);
      setMySubmissions(mySubs.slice(0, 5)); // Show top 5 recent
    } catch (error) {
      console.error('Failed to load personal stats', error);
    }
  };


  useEffect(() => {
    // Anti-Cheat Logic
    if (!contest || !contest.exam_mode_enabled || !contest.has_started || contest.has_finished_exam || contest.is_locked) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        logEvent('tab_hidden', { reason: 'visibility_hidden' });
      }
    };

    const handleBlur = () => {
      logEvent('window_blur', { reason: 'window_blur' });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [contest]);

  const logEvent = async (type: string, metadata: any) => {
    if (!contestId) return;
    try {
      const res = await api.logExamEvent(contestId, type, metadata);
      if (res.locked) {
        // Refresh contest to update locked status
        loadContest();
        setLockModalOpen(true);
      }
    } catch (error) {
      console.error('Failed to log event', error);
    }
  };



  const handleSubmissionClick = (submissionId: string) => {
    setSearchParams(prev => {
      prev.set('select_id', submissionId);
      return prev;
    });
  };

  const handleCloseModal = () => {
    setSearchParams(prev => {
      prev.delete('select_id');
      return prev;
    });
  };

  const getStatusBadge = (status: string) => {
    let type: StatusType = 'gray';
    let label = status;

    switch (status) {
      case 'AC':
        type = 'success';
        label = 'AC';
        break;
      case 'WA':
        type = 'error';
        label = 'WA';
        break;
      case 'TLE':
        type = 'purple';
        label = 'TLE';
        break;
      case 'MLE':
        type = 'purple';
        label = 'MLE';
        break;
      case 'RE':
        type = 'error';
        label = 'RE';
        break;
      case 'CE':
        type = 'warning';
        label = 'CE';
        break;
      case 'pending':
        type = 'gray';
        label = 'Pending';
        break;
      case 'judging':
        type = 'info';
        label = 'Judging';
        break;
      case 'SE':
        type = 'error';
        label = 'SE';
        break;
      default:
        type = 'gray';
        label = status;
    }

    return <StatusBadge status={type} text={label} size="sm" />;
  };



  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-TW', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getProblemStatus = (problemId: number) => {
    if (!myRank || !myRank.problems) return null;
    const stats = myRank.problems[problemId] || myRank.problems[problemId.toString()];
    if (!stats) return null;
    
    if (stats.status === 'AC') return <StatusBadge status="success" text="AC" size="sm" />;
    if (stats.pending) return <StatusBadge status="gray" text="Pending" size="sm" />;
    if (stats.tries > 0) return <StatusBadge status="error" text="Tried" size="sm" />;
    return <StatusBadge status="gray" text="Unsolved" size="sm" />;
  };

  const isProblemsPage = location.pathname.endsWith('/problems');

  if (loading) return <Loading />;
  if (!contest) return <div>Contest not found</div>;

  // Render Problems View
  if (isProblemsPage) {
    return (
      <SurfaceSection>
        <div className="cds--grid" style={{ padding: 0 }}>
          <div className="cds--row">
            <div className="cds--col-lg-16">
              <ContainerCard title="題目列表" noPadding>
                <DataTable
                  rows={problems.map(p => ({ ...p, id: p.id.toString() }))}
                  headers={[
                    { key: 'label', header: '標號' },
                    { key: 'title', header: '題目' },
                    { key: 'score', header: '分數' },
                    { key: 'status', header: '狀態' },
                    { key: 'action', header: '操作' }
                  ]}
                >
                  {({
                    rows,
                    headers,
                    getHeaderProps,
                    getRowProps,
                    getTableProps
                  }: any) => {
                    return (
                    <TableContainer>
                      <Table {...getTableProps()}>
                        <TableHead>
                          <TableRow>
                            {headers.map((header: any) => {
                              const { key, ...headerProps } = getHeaderProps({ header });
                              return (
                                <TableHeader {...headerProps} key={key}>
                                  {header.header}
                                </TableHeader>
                              );
                            })}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {rows.map((row: any) => {
                            const problem = problems.find(p => p.id.toString() === row.id);
                            const { key, ...rowProps } = getRowProps({ row });
                            return (
                              <TableRow 
                                {...rowProps} 
                                key={key}
                                onClick={() => {
                                  const canView = (currentUser?.role === 'admin' || currentUser?.role === 'teacher') || 
                                    (contest.status === 'active' && contest.has_started && !contest.has_finished_exam && !contest.is_locked);
                                  
                                  if (canView) {
                                    navigate(`/contests/${contestId}/problems/${problem?.problem_id || problem?.id}`);
                                  }
                                }}
                                style={{ 
                                  cursor: ((currentUser?.role === 'admin' || currentUser?.role === 'teacher') || 
                                    (contest.status === 'active' && contest.has_started && !contest.has_finished_exam && !contest.is_locked)) 
                                    ? 'pointer' : 'not-allowed',
                                  opacity: ((currentUser?.role === 'admin' || currentUser?.role === 'teacher') || 
                                    (contest.status === 'active' && contest.has_started && !contest.has_finished_exam && !contest.is_locked)) 
                                    ? 1 : 0.5
                                }}
                              >
                                <TableCell>
                                  <Tag type="cyan">{problem?.label}</Tag>
                                </TableCell>
                                <TableCell>{problem?.title}</TableCell>
                                <TableCell>{problem?.score}</TableCell>
                                <TableCell>
                                  {problem && getProblemStatus(problem.id)}
                                </TableCell>
                                <TableCell>
                                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <Button 
                                      kind="ghost" 
                                      size="sm" 
                                      renderIcon={Play}
                                      disabled={!((currentUser?.role === 'admin' || currentUser?.role === 'teacher') || 
                                        (contest.status === 'active' && contest.has_started && !contest.has_finished_exam && !contest.is_locked))}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/contests/${contestId}/problems/${problem?.problem_id || problem?.id}`);
                                      }}
                                    >
                                      前往
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  );
                  }}
                </DataTable>
              </ContainerCard>
              <ContainerCard title="近期提交趨勢" noPadding>
                <div style={{ padding: '1.5rem' }}>
                  <SubmissionTrendChart 
                    data={[
                      { date: '10:00', count: 2 },
                      { date: '10:15', count: 5 },
                      { date: '10:30', count: 3 },
                      { date: '10:45', count: 8 },
                      { date: '11:00', count: 6 },
                      { date: '11:15', count: 12 },
                      { date: '11:30', count: 9 },
                      { date: '11:45', count: 15 },
                    ]} 
                    height={250}
                  />
                </div>
              </ContainerCard>
            </div>
          </div>
        </div>
      </SurfaceSection>
    );
  }

  // Render Overview View
  return (
    <SurfaceSection>
      <div className="cds--grid" style={{ padding: 0 }}>
        <div className="cds--row">
          {/* Left Column: Description & Rules */}
          <div className="cds--col-lg-10 cds--col-md-8">


            {contest.rules && (
              <ContainerCard title="競賽規則" style={{ marginBottom: '1.5rem' }}>
                <div className="markdown-body" style={{ marginTop: '0.5rem' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {contest.rules}
                  </ReactMarkdown>
                </div>
              </ContainerCard>
            )}
          </div>

          {/* Right Column: Stats */}
          <div className="cds--col-lg-6 cds--col-md-8">
            <ContainerCard title="我的成績" style={{ marginBottom: '1.5rem' }}>
              {myRank ? (
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 300, marginBottom: '0.5rem' }}>
                    Rank {myRank.rank}
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', color: 'var(--cds-text-secondary)' }}>
                    <div>Solved: {(myRank as any).solved_count}</div>
                    <div>Penalty: {(myRank as any).penalty}</div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--cds-text-secondary)' }}>
                  暫無排名數據
                </div>
              )}

              <h5 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--cds-text-secondary)' }}>
                <Time size={16} /> 最近提交
              </h5>
              
              {mySubmissions.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {mySubmissions.map(sub => (
                    <div 
                      key={sub.id} 
                      onClick={() => handleSubmissionClick(sub.id.toString())}
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        padding: '0.5rem',
                        borderBottom: '1px solid var(--cds-border-subtle)',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {getStatusBadge(sub.status)}
                        <span style={{ fontSize: '0.875rem' }}>{sub.problem?.title || sub.problem}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                        {formatDate(sub.created_at)}
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop: '1rem', textAlign: 'right' }}>
                    <Button kind="ghost" size="sm" onClick={() => navigate(`/contests/${contestId}/submissions`)}>
                      查看全部
                    </Button>
                  </div>
                </div>
              ) : (
                <div style={{ color: 'var(--cds-text-secondary)', fontSize: '0.875rem' }}>
                  尚無提交記錄
                </div>
              )}
            </ContainerCard>
          </div>
        </div>
      </div>
      
      <SubmissionDetailModal
        submissionId={searchParams.get('select_id')}
        isOpen={!!searchParams.get('select_id')}
        onClose={handleCloseModal}
      />

      {/* Lock Notification Modal */}
      <Modal
        open={lockModalOpen}
        modalHeading="考試鎖定通知"
        passiveModal
        onRequestClose={() => setLockModalOpen(false)}
      >
        <p style={{ fontSize: '1rem', color: 'var(--cds-text-error)' }}>
          您因多次違規已被鎖定，無法繼續考試。
        </p>
      </Modal>
    </SurfaceSection>
  );
};

export default ContestDashboard;
