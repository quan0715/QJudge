import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Loading,
  Button,
  InlineLoading
} from '@carbon/react';
import { Renew } from '@carbon/icons-react';
import { getContestStandings } from '@/services/contest';
import ContestScoreboard, { type ProblemInfo, type StandingRow } from '@/domains/contest/components/ContestScoreboard';
import SurfaceSection from '@/ui/components/layout/SurfaceSection';
import ContainerCard from '@/ui/components/layout/ContainerCard';

interface ContestStandingsPageProps {
  maxWidth?: string;
}

const ContestStandingsPage: React.FC<ContestStandingsPageProps> = ({ maxWidth }) => {
  const { contestId } = useParams<{ contestId: string }>();
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
      const data = await getContestStandings(contestId!) as any;
      // mapScoreboardDto returns { problems: [], rows: [] }
      if (data.problems && data.rows) {
        setProblems(data.problems);
        setStandings(data.rows);
      } else if (data.problems && data.standings) {
        // Fallback for old API format
        setProblems(data.problems);
        setStandings(data.standings);
      } else {
        // Fallback for very old API (shouldn't happen)
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
    <SurfaceSection maxWidth={maxWidth} style={{ minHeight: '100%', flex: 1 }}>
      <div className="cds--grid" style={{ padding: 0 }}>
        <div className="cds--row">
          <div className="cds--col-lg-16">
            <ContainerCard 
              title="即時排行榜" 
              action={
                <Button 
                  kind="ghost" 
                  renderIcon={refreshing ? InlineLoading : Renew} 
                  onClick={handleRefresh}
                  disabled={refreshing}
                  size="sm"
                  hasIconOnly
                  iconDescription={refreshing ? '更新中...' : '重新整理'}
                />
              }
              noPadding
            >
              <div style={{ padding: '1rem' }}>
                <p style={{ marginBottom: '1rem', color: 'var(--cds-text-secondary)' }}>
                  ICPC 規則：排名優先依據解題數，其次為總罰時（解題時間 + 20分鐘/錯誤嘗試）。
                </p>
                <ContestScoreboard 
                  problems={problems} 
                  standings={standings} 
                  loading={loading}
                  contestId={contestId}
                />
              </div>
            </ContainerCard>
          </div>
        </div>
      </div>
    </SurfaceSection>
  );
};

export default ContestStandingsPage;
