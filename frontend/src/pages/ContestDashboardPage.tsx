import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  Tag,
  Tabs,
  Tab,
  TabList,
  TabPanels,
  TabPanel,
  Loading,
  ProgressBar
} from '@carbon/react';
import { Time } from '@carbon/icons-react';
import { api } from '../services/api';
import type { Contest } from '../services/api';

const ContestDashboardPage = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  
  const [contest, setContest] = useState<Contest | null>(null);
  const [problems, setProblems] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [standings, setStandings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
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
      return () => clearInterval(timer);
    }
  }, [contest]);

  const fetchData = async (id: string) => {
    try {
      const [contestData, announcementsData, standingsData] = await Promise.all([
        api.getContest(id),
        api.getContestAnnouncements(id),
        api.getContestStandings(id)
      ]);
      
      setContest(contestData || null);
      setContest(contestData || null);
      // Admin serializer returns 'problem_list', Student serializer returns 'problems'
      const problemsList = (contestData as any).problems || (contestData as any).problem_list || [];
      setProblems(problemsList);
      setAnnouncements(announcementsData);
      setStandings(standingsData);
    } catch (error) {
      console.error('Failed to fetch contest data', error);
    } finally {
      setLoading(false);
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

  const problemHeaders = [
    { key: 'status', header: '狀態' },
    { key: 'title', header: '題目' },
    { key: 'score', header: '分數' },
  ];

  const problemRows = problems.map(p => ({
    id: p.problem.id.toString(),
    status: <Tag type="gray">未解</Tag>, // TODO: Check user submission status
    title: p.problem.title,
    score: p.score,
  }));

  const leaderboardHeaders = [
    { key: 'rank', header: '排名' },
    { key: 'user', header: '用戶' },
    { key: 'score', header: '總分' },
    { key: 'time', header: '加入時間' }
  ];

  const leaderboardRows = standings.map((s, index) => ({
    id: s.user.id.toString(),
    rank: s.rank || index + 1,
    user: s.user.username,
    score: s.score,
    time: new Date(s.joined_at).toLocaleString()
  }));

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

      <Tabs>
        <TabList aria-label="Contest tabs">
          <Tab>題目列表</Tab>
          <Tab>排行榜</Tab>
          <Tab>公告 ({announcements.length})</Tab>
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
              <DataTable rows={leaderboardRows} headers={leaderboardHeaders}>
                {({ rows, headers, getHeaderProps, getTableProps, getRowProps }) => (
                  <TableContainer title="即時排行榜">
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
          <TabPanel>
            <div style={{ marginTop: '1rem' }}>
              {announcements.map(ann => (
                <Tile key={ann.id} style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <h4 style={{ fontWeight: 'bold' }}>{ann.title}</h4>
                    <span style={{ color: 'gray', fontSize: '0.875rem' }}>{new Date(ann.created_at).toLocaleString()}</span>
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
        </TabPanels>
      </Tabs>
    </div>
  );
};

export default ContestDashboardPage;
