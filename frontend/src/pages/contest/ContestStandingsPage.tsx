import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  Loading,
  Button,
  InlineLoading
} from '@carbon/react';
import { Renew, ArrowLeft } from '@carbon/icons-react';
import { api } from '@/services/api';

interface ProblemInfo {
  id: number;
  title: string;
  order: number;
  label: string;
}

interface ProblemStats {
  status: 'AC' | 'attempted' | null;
  tries: number;
  time: number;
  pending: boolean;
}

interface StandingRow {
  rank: number;
  user: {
    id: number;
    username: string;
  };
  solved: number;
  time: number;
  problems: Record<string, ProblemStats>;
}

const ContestStandingsPage = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const [problems, setProblems] = useState<ProblemInfo[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (contestId) {
      fetchStandings();
      // Auto refresh every 30 seconds
      const interval = setInterval(fetchStandings, 30000);
      return () => clearInterval(interval);
    }
  }, [contestId]);

  const fetchStandings = async () => {
    if (!refreshing && standings.length === 0) setLoading(true);
    try {
      const data = await api.getContestStandings(contestId!) as any;
      // Backend now returns { problems: [], standings: [] }
      if (data.problems && data.standings) {
        setProblems(data.problems);
        setStandings(data.standings);
      } else {
        // Fallback for old API (shouldn't happen if backend deployed)
        setStandings(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to fetch standings:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStandings();
  };

  const getCellColor = (stats: ProblemStats) => {
    if (stats.status === 'AC') return '#e6fffa'; // Light green
    if (stats.pending) return '#fff0f6'; // Light pink/yellow? Or maybe yellow for pending
    if (stats.tries > 0) return '#fff1f0'; // Light red
    return 'transparent';
  };

  // Prepare headers for DataTable
  const headers = [
    { key: 'rank', header: '排名' },
    { key: 'user', header: '隊伍 / 用戶' },
    { key: 'solved', header: '解題數' },
    { key: 'time', header: '罰時' },
    ...problems.map(p => ({
      key: `problem_${p.id}`,
      header: p.label
    }))
  ];

  const rows = standings.map(s => {
      const row: any = {
          id: s.user.id.toString(),
          rank: s.rank,
          user: s.user.username,
          solved: s.solved,
          time: s.time
      };
      
      problems.forEach(p => {
          const stats = s.problems[p.id] || s.problems[p.id.toString()];
          row[`problem_${p.id}`] = stats;
      });
      
      return row;
  });

  const renderCell = (cell: any) => {
    // Check if it's a problem column
    if (cell.info.header.startsWith('problem_')) {
      const stats = cell.value as ProblemStats | null;
      if (!stats) return null;

      const bgColor = getCellColor(stats);
      const textColor = stats.status === 'AC' ? '#00524d' : 
                       stats.pending ? '#8a3ffc' : '#a61e4d';

      return (
        <div style={{ 
          backgroundColor: bgColor,
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '0.5rem',
          minHeight: '60px',
          minWidth: '60px' // Ensure minimum width
        }}>
          {stats.status === 'AC' && (
            <>
              <div style={{ fontWeight: 'bold', fontSize: '1.1em', color: textColor }}>{stats.time}</div>
              <div style={{ fontSize: '0.8em', color: textColor }}>
                {stats.tries === 1 ? '1 try' : `${stats.tries} tries`}
              </div>
            </>
          )}
          {stats.pending && (
            <>
              <div style={{ fontWeight: 'bold', color: textColor }}>Pending</div>
              <div style={{ fontSize: '0.8em', color: textColor }}>{stats.tries} tries</div>
            </>
          )}
          {!stats.status && !stats.pending && stats.tries > 0 && (
             <div style={{ fontSize: '0.8em', color: textColor }}>
                {stats.tries === 1 ? '1 try' : `${stats.tries} tries`}
             </div>
          )}
        </div>
      );
    }

    // Default rendering for other columns
    if (cell.info.header === 'rank') {
      return <div style={{ fontWeight: 'bold', textAlign: 'center', width: '40px' }}>{cell.value}</div>;
    }
    if (cell.info.header === 'solved') {
      return <div style={{ fontWeight: 'bold', textAlign: 'center', width: '60px' }}>{cell.value}</div>;
    }
    if (cell.info.header === 'time') {
      return <div style={{ textAlign: 'center', width: '60px' }}>{cell.value}</div>;
    }
    if (cell.info.header === 'user') {
       return <div style={{ fontWeight: 600, paddingLeft: '0.5rem' }}>{cell.value}</div>;
    }

    return cell.value;
  };

  if (loading && !refreshing && standings.length === 0) return <Loading />;

  return (
    <div style={{ padding: '2rem', maxWidth: '100%', overflowX: 'auto' }}>
      {/* ... header ... */}
      <div style={{ marginBottom: '2rem', maxWidth: '1200px', margin: '0 auto 2rem' }}>
        <Button 
            kind="ghost" 
            renderIcon={ArrowLeft} 
            onClick={() => navigate(`/contests/${contestId}`)}
            style={{ marginBottom: '1rem' }}
        >
            返回競賽
        </Button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 300, marginBottom: '0.5rem' }}>即時排行榜</h1>
            <p style={{ color: 'var(--cds-text-secondary)' }}>
                ICPC 規則：排名優先依據解題數，其次為總罰時（解題時間 + 20分鐘/錯誤嘗試）。
            </p>
            </div>
            <Button 
            kind="tertiary" 
            renderIcon={refreshing ? InlineLoading : Renew} 
            onClick={handleRefresh}
            disabled={refreshing}
            >
            {refreshing ? '更新中...' : '重新整理'}
            </Button>
        </div>
      </div>

      <DataTable rows={rows} headers={headers}>
        {({
          rows,
          headers,
          getTableProps,
          getHeaderProps,
          getRowProps
        }: any) => (
          <TableContainer>
            <Table {...getTableProps()} isSortable style={{ tableLayout: 'fixed', width: '100%' }}>
              <TableHead>
                <TableRow>
                  {headers.map((header: any) => (
                    <TableHeader 
                        {...getHeaderProps({ header })} 
                        key={header.key} 
                        style={{ 
                            textAlign: header.key === 'user' ? 'left' : 'center',
                            width: header.key === 'rank' ? '60px' : 
                                   header.key === 'solved' ? '80px' : 
                                   header.key === 'time' ? '80px' : 
                                   header.key.startsWith('problem_') ? '80px' : 'auto'
                        }}
                    >
                      {header.header}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row: any) => (
                  <TableRow {...getRowProps({ row })} key={row.id}>
                    {row.cells.map((cell: any) => (
                      <TableCell 
                        key={cell.id} 
                        style={{ 
                            padding: cell.info.header.startsWith('problem_') ? 0 : '1rem',
                            textAlign: cell.info.header === 'user' ? 'left' : 'center'
                        }}
                      >
                        {renderCell(cell)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>
    </div>
  );
};

export default ContestStandingsPage;
