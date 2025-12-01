import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Loading,
  Button,
  InlineLoading
} from '@carbon/react';
import { Renew, ArrowLeft } from '@carbon/icons-react';
import { api } from '@/services/api';
import ContestScoreboard, { type ProblemInfo, type StandingRow } from '@/components/contest/ContestScoreboard';

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

  if (loading && !refreshing && standings.length === 0) return <Loading />;

  return (
    <div style={{ padding: '2rem', maxWidth: '100%', overflowX: 'auto' }}>
      {/* Header */}
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

      <ContestScoreboard 
        problems={problems} 
        standings={standings} 
        loading={loading} 
      />
    </div>
  );
};

export default ContestStandingsPage;
