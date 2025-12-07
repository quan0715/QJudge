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
import { getContest, getScoreboard, recordExamEvent } from '@/services/contest';
import { getSubmissions } from '@/services/submission';
import type { ContestDetail, ScoreboardRow, ContestProblemSummary } from '@/core/entities/contest.entity';
import type { Submission } from '@/core/entities/submission.entity';
import { useSearchParams } from 'react-router-dom';
import { SubmissionDetailModal } from '@/domains/submission/components/SubmissionDetailModal';
import { SubmissionStatusBadge } from '@/ui/components/badges/SubmissionStatusBadge';
import SurfaceSection from '@/ui/components/layout/SurfaceSection';
import ContainerCard from '@/ui/components/layout/ContainerCard';
// import SubmissionTrendChart from '@/domains/contest/components/SubmissionTrendChart';
import { useLocation } from 'react-router-dom';

const ContestDashboard = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Personal stats state
  const [myRank, setMyRank] = useState<ScoreboardRow | null>(null);
  const [problems, setProblems] = useState<ContestProblemSummary[]>([]);
  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);
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
      const data = await getContest(contestId!);
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
      const standingsData = await getScoreboard(contestId);
      if (standingsData && standingsData.rows && Array.isArray(standingsData.rows)) {
        const myEntry = standingsData.rows.find((s: ScoreboardRow) => s.displayName === currentUser.username); // Assuming displayName is username or similar
        setMyRank(myEntry || null);
        
        // Map Scoreboard problems to ContestProblemSummary if needed, or use what's available
        // ScoreboardData problems are slightly different from ContestDetail problems
        // Here we use what's in ScoreboardData which has label, problemId, score
        const mappedProblems: ContestProblemSummary[] = standingsData.problems.map((p: any) => ({
            id: p.problemId, // This might be contest_problem id or problem id depending on backend. 
            // Assuming p.problemId is the ID we need for navigation or matching
            problemId: p.problemId,
            label: p.label,
            title: p.label, // Scoreboard data might not have title, use label as fallback
            score: p.score
        }));
        setProblems(mappedProblems);
      }

      // Load submissions
      const submissions = await getSubmissions({ contest_id: contestId });
      // @ts-ignore - type mismatch fixes to be handled later or in mapper
      const submissionList = submissions.results || [];
      const mySubs = submissionList.filter((s: Submission) => s.username === currentUser.username || s.userId === currentUser.id?.toString());
      setMySubmissions(mySubs.slice(0, 5)); // Show top 5 recent
    } catch (error) {
      console.error('Failed to load personal stats', error);
    }
  };


  useEffect(() => {
    // Anti-Cheat Logic
    if (!contest || !contest.examModeEnabled || !contest.hasStarted || contest.hasFinishedExam || contest.isLocked) {
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
      const res = await recordExamEvent(contestId, type, metadata);
      // Check if response indicates locked. Backend likely returns snake_case or whatever api.logExamEvent returns.
      // api.logExamEvent returns res.json().
      if (res && res.locked) {
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
      prev.set('submission_id', submissionId);
      return prev;
    });
  };

  const handleCloseModal = () => {
    setSearchParams(prev => {
      prev.delete('submission_id');
      return prev;
    });
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

  const getProblemStatus = (problemId: string) => {
    if (!myRank || !myRank.problems) return null;
    const stats = myRank.problems[problemId];
    if (!stats) return null;
    
    return <SubmissionStatusBadge status={stats.status || (stats.attempts > 0 ? 'WA' : 'NS')} size="sm" />;
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
                  rows={problems.map(p => ({ ...p, id: p.id }))}
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
                            const problem = problems.find(p => p.id === row.id);
                            const { key, ...rowProps } = getRowProps({ row });
                            return (
                              <TableRow 
                                {...rowProps} 
                                key={key}
                                onClick={() => {
                                  const canView = (currentUser?.role === 'admin' || currentUser?.role === 'teacher') || 
                                    (contest.status === 'active' && contest.hasStarted && !contest.hasFinishedExam && !contest.isLocked);
                                  
                                  if (canView) {
                                    navigate(`/contests/${contestId}/problems/${problem?.problemId || problem?.id}`);
                                  }
                                }}
                                style={{ 
                                  cursor: ((currentUser?.role === 'admin' || currentUser?.role === 'teacher') || 
                                    (contest.status === 'active' && contest.hasStarted && !contest.hasFinishedExam && !contest.isLocked)) 
                                    ? 'pointer' : 'not-allowed',
                                  opacity: ((currentUser?.role === 'admin' || currentUser?.role === 'teacher') || 
                                    (contest.status === 'active' && contest.hasStarted && !contest.hasFinishedExam && !contest.isLocked)) 
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
                                        (contest.status === 'active' && contest.hasStarted && !contest.hasFinishedExam && !contest.isLocked))}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/contests/${contestId}/problems/${problem?.problemId || problem?.id}`);
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
              {/* <ContainerCard title="近期提交趨勢" noPadding>
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
              </ContainerCard> */}
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
                    <div>Solved: {myRank.solvedCount}</div>
                    <div>Penalty: {myRank.penalty}</div>
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
                        <SubmissionStatusBadge status={sub.status} size="sm" />
                        <span style={{ fontSize: '0.875rem' }}>{sub.problemId}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                        {formatDate(sub.createdAt)}
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
        submissionId={searchParams.get('submission_id')}
        isOpen={!!searchParams.get('submission_id')}
        onClose={handleCloseModal}
        contestId={contestId}
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
