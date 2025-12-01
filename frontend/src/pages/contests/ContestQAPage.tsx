import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import ContestClarifications from '@/components/contest/ContestClarifications';
import { api } from '@/services/api';
import type { ContestDetail } from '@/models/contest';
import { Loading } from '@carbon/react';

const ContestQAPage = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (contestId) {
      api.getContest(contestId).then(c => {
        setContest(c || null);
        setLoading(false);
      });
    }
  }, [contestId]);

  if (loading) return <Loading />;
  if (!contest) return <div>Contest not found</div>;

  return (
    <div className="cds--grid" style={{ padding: '2rem' }}>
      <div className="cds--row">
        <div className="cds--col-lg-16">
          <ContestClarifications 
            contestId={contest.id} 
            isTeacherOrAdmin={['teacher', 'admin'].includes(contest.current_user_role)}
            problems={contest.problems}
          />
        </div>
      </div>
    </div>
  );
};

export default ContestQAPage;
