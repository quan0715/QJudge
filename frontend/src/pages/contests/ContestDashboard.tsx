import { useState, useEffect } from 'react';
import { useOutletContext, useNavigate, useParams } from 'react-router-dom';
import { 
  Button, 
  Tile, 
  Tag, 
  Loading,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer
} from '@carbon/react';
import { Play, Locked, CheckmarkFilled, Trophy, Time } from '@carbon/icons-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '@/services/api';
import type { ContestDetail } from '@/models/contest';
import ContestScoreboard, { type ProblemInfo, type StandingRow } from '@/components/contest/ContestScoreboard';
import { View } from '@carbon/icons-react';
import { useSearchParams } from 'react-router-dom';
import SubmissionDetailModal from '@/components/contest/SubmissionDetailModal';

const ContestDashboard = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { refreshContest } = useOutletContext<{ refreshContest: () => void }>();
  
  // Personal stats state
  const [myRank, setMyRank] = useState<StandingRow | null>(null);
  const [problems, setProblems] = useState<ProblemInfo[]>([]);
  const [mySubmissions, setMySubmissions] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);

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

  const handleEnterExam = async () => {
    if (!contest) return;
    
    try {
      if (!contest.has_started) {
        await api.startExam(contest.id);
        await refreshContest();
        await loadContest();
      }
      navigate(`/contests/${contest.id}/problems`);
    } catch (error) {
      console.error('Failed to enter exam', error);
      alert('無法進入考試，請稍後再試');
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

  const getStatusTag = (status: string) => {
    const statusConfig: Record<string, { type: any; label: string }> = {
      'AC': { type: 'green', label: 'AC' },
      'WA': { type: 'red', label: 'WA' },
      'TLE': { type: 'magenta', label: 'TLE' },
      'MLE': { type: 'magenta', label: 'MLE' },
      'RE': { type: 'red', label: 'RE' },
      'CE': { type: 'gray', label: 'CE' },
      'pending': { type: 'gray', label: 'Pending' },
      'judging': { type: 'blue', label: 'Judging' },
      'SE': { type: 'red', label: 'SE' }
    };

    const config = statusConfig[status] || { type: 'gray', label: status };
    return <Tag type={config.type} size="sm">{config.label}</Tag>;
  };

  const getLanguageLabel = (lang: string) => {
    const langMap: Record<string, string> = {
      'cpp': 'C++',
      'python': 'Python',
      'java': 'Java',
      'javascript': 'JavaScript',
      'c': 'C'
    };
    return langMap[lang] || lang;
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
    
    if (stats.status === 'AC') return <Tag type="green" size="sm">AC</Tag>;
    if (stats.pending) return <Tag type="gray" size="sm">Pending</Tag>;
    if (stats.tries > 0) return <Tag type="red" size="sm">Tried</Tag>;
    return <Tag type="gray" size="sm">Unsolved</Tag>;
  };

  if (loading) return <Loading />;
  if (!contest) return <div>Contest not found</div>;

  const isExamActive = contest.exam_mode_enabled && contest.status === 'active';

  return (
    <div className="cds--grid" style={{ padding: '2rem' }}>
      <div className="cds--row">
        <div className="cds--col-lg-16">
          {/* Hero Section with Title and Action Button */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'flex-start',
            marginBottom: '2rem',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div>
              <h1 style={{ marginBottom: '1rem' }}>{contest.name}</h1>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Tag type={contest.status === 'active' ? 'green' : 'gray'}>
                  {contest.status === 'active' ? '進行中' : '非活動'}
                </Tag>
                <Tag type="blue">{contest.visibility}</Tag>
                {contest.exam_mode_enabled && <Tag type="purple">考試模式</Tag>}
              </div>
            </div>

            {/* Exam Action Button - Moved to Hero Section Right Side */}
            {isExamActive && (
              <div style={{ minWidth: '200px' }}>
                {contest.is_locked ? (
                  <Button kind="danger" disabled renderIcon={Locked} style={{ width: '100%' }}>
                    已被鎖定
                  </Button>
                ) : contest.has_finished_exam ? (
                  <Button kind="ghost" disabled renderIcon={CheckmarkFilled} style={{ width: '100%' }}>
                    已完成考試
                  </Button>
                ) : (
                  <Button
                    renderIcon={Play}
                    size="xl"
                    onClick={handleEnterExam}
                    style={{ width: '100%' }}
                  >
                    {contest.has_started ? '繼續考試' : '開始考試'}
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="cds--row">
            <div className="cds--col-lg-10 cds--col-md-8">
              <Tile style={{ marginBottom: '2rem' }}>
                <h3>競賽說明</h3>
                <div className="markdown-body" style={{ marginTop: '1rem', overflow: 'visible', height: 'auto' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {contest.description || '無描述'}
                  </ReactMarkdown>
                </div>
              </Tile>

              {contest.rules && (
                <Tile style={{ marginBottom: '2rem' }}>
                  <h3>競賽規則</h3>
                  <div className="markdown-body" style={{ marginTop: '1rem' }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {contest.rules}
                    </ReactMarkdown>
                  </div>
                </Tile>
              )}
            </div>

            <div className="cds--col-lg-10 cds--col-md-8">
              {/* Problem List Section */}
              {problems.length > 0 && (
                <Tile style={{ marginBottom: '2rem' }}>
                  <h3>題目列表</h3>
                  <div style={{ marginTop: '1rem' }}>
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
                      }: any) => (
                        <TableContainer>
                          <Table {...getTableProps()}>
                            <TableHead>
                              <TableRow>
                                {headers.map((header: any) => (
                                  <TableHeader {...getHeaderProps({ header })}>
                                    {header.header}
                                  </TableHeader>
                                ))}
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {rows.map((row: any) => {
                                const problem = problems.find(p => p.id.toString() === row.id);
                                return (
                                  <TableRow 
                                    {...getRowProps({ row })} 
                                    onClick={() => navigate(`/contests/${contestId}/problems/${problem?.problem_id || problem?.id}`)}
                                    style={{ cursor: 'pointer' }}
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
                                      <Button kind="ghost" size="sm" renderIcon={Play}>
                                        前往
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
                  </div>
                </Tile>
              )}
            </div>

            <div className="cds--col-lg-6 cds--col-md-8">
              {/* Personal Stats Card */}
              <Tile style={{ marginBottom: '2rem', height: '100%' }}>
                <h4 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Trophy /> 我的成績
                </h4>
                
                {myRank ? (
                  <div style={{ marginBottom: '2rem' }}>
                    <ContestScoreboard 
                      problems={problems} 
                      standings={[myRank]} 
                      loading={false}
                    />
                  </div>
                ) : (
                  <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--cds-text-secondary)', marginBottom: '2rem' }}>
                    暫無排名數據
                  </div>
                )}

                <h5 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Time /> 最近提交
                </h5>
                {mySubmissions.length > 0 ? (
                  <DataTable
                    rows={mySubmissions.map(sub => ({
                      id: sub.id.toString(),
                      status: sub.status,
                      problem: sub.problem?.title || sub.problem,
                      language: sub.language,
                      score: sub.score,
                      time: sub.exec_time,
                      created_at: sub.created_at
                    }))}
                    headers={[
                      { key: 'status', header: '狀態' },
                      { key: 'problem', header: '題目' },
                      { key: 'language', header: '語言' },
                      { key: 'score', header: '得分' },
                      { key: 'time', header: '耗時' },
                      { key: 'created_at', header: '時間' },
                      { key: 'action', header: '操作' }
                    ]}
                  >
                    {({
                      rows,
                      headers,
                      getHeaderProps,
                      getRowProps,
                      getTableProps
                    }: any) => (
                      <TableContainer>
                        <Table {...getTableProps()} size="sm">
                          <TableHead>
                            <TableRow>
                              {headers.map((header: any) => (
                                <TableHeader {...getHeaderProps({ header })}>
                                  {header.header}
                                </TableHeader>
                              ))}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {rows.map((row: any) => {
                              const sub = mySubmissions.find(s => s.id.toString() === row.id);
                              return (
                                <TableRow 
                                  {...getRowProps({ row })} 
                                  onClick={() => handleSubmissionClick(sub.id.toString())}
                                  style={{ cursor: 'pointer' }}
                                >
                                  <TableCell>{getStatusTag(sub.status)}</TableCell>
                                  <TableCell>{sub.problem?.title || sub.problem}</TableCell>
                                  <TableCell>{getLanguageLabel(sub.language)}</TableCell>
                                  <TableCell>{sub.score}</TableCell>
                                  <TableCell>{sub.exec_time} ms</TableCell>
                                  <TableCell>{formatDate(sub.created_at)}</TableCell>
                                  <TableCell>
                                    <Button 
                                      kind="ghost" 
                                      size="sm" 
                                      renderIcon={View} 
                                      hasIconOnly 
                                      iconDescription="查看"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSubmissionClick(sub.id.toString());
                                      }}
                                    />
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </DataTable>
                ) : (
                  <div style={{ color: 'var(--cds-text-secondary)', fontSize: '0.875rem' }}>
                    尚無提交記錄
                  </div>
                )}
                {mySubmissions.length > 0 && (
                   <div style={{ marginTop: '1rem', textAlign: 'right' }}>
                      <Button kind="ghost" size="sm" onClick={() => navigate(`/contests/${contestId}/submissions`)}>
                        查看全部
                      </Button>
                   </div>
                )}
              </Tile>
            </div>
          </div>
        </div>
      </div>
      
      <SubmissionDetailModal
        submissionId={searchParams.get('select_id')}
        isOpen={!!searchParams.get('select_id')}
        onClose={handleCloseModal}
      />
    </div>
  );
};

export default ContestDashboard;
