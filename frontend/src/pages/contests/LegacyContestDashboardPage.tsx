import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loading, InlineNotification } from '@carbon/react';
import { api } from '@/services/api';
import type { ContestDetail } from '@/models/contest';
import ContestStudentView from '@/components/contest/ContestStudentView';
import ContestTeacherView from '@/components/contest/ContestTeacherView';

const ContestDashboardPage = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const [searchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (contestId) {
      fetchContest();
    }
  }, [contestId]);

  const fetchContest = async () => {
    if (!contestId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await api.getContest(contestId);
      
      if (!data) {
        setError('找不到競賽');
        return;
      }

      setContest(data);
    } catch (err: any) {
      console.error('Failed to fetch contest:', err);
      setError(err.message || '無法載入競賽資料');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center' }}>
        <Loading description="載入中..." withOverlay={false} />
      </div>
    );
  }

  if (error || !contest) {
    return (
      <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <InlineNotification
          kind="error"
          title="載入失敗"
          subtitle={error || '找不到競賽'}
          lowContrast
        />
      </div>
    );
  }

  const isTeacherOrAdmin = contest.current_user_role === 'teacher' || contest.current_user_role === 'admin';
  const showTeacherView = isTeacherOrAdmin && viewParam !== 'student';

  return (
    <div>
      {/* Use existing ContestLayout header for navigation */}
      {showTeacherView ? (
        <ContestTeacherView contest={contest} onRefresh={fetchContest} />
      ) : (
        <ContestStudentView contest={contest} onRefresh={fetchContest} />
      )}
    </div>
  );
};

export default ContestDashboardPage;
