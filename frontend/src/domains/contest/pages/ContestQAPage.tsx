import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import ContestClarifications from '@/domains/contest/components/ContestClarifications';
import { getContest } from '@/services/contest';
import type { ContestDetail } from '@/core/entities/contest.entity';
import { mapContestDetailDto } from '@/core/entities/mappers/contestMapper';
import { Loading } from '@carbon/react';
import SurfaceSection from '@/ui/components/layout/SurfaceSection';
import ContainerCard from '@/ui/components/layout/ContainerCard';

const ContestQAPage = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (contestId) {
      getContest(contestId).then((rawData: any) => {
        const data = mapContestDetailDto(rawData);
        setContest(data || null);
        setLoading(false);
      });
    }
  }, [contestId]);

  if (loading) return <Loading />;
  if (!contest) return <div>Contest not found</div>;

  return (
    <SurfaceSection>
      <div className="cds--grid" style={{ padding: 0 }}>
        <div className="cds--row">
          <div className="cds--col-lg-16">
            <ContainerCard title="提問與討論">
              <p style={{ marginBottom: '1.5rem', color: 'var(--cds-text-secondary)' }}>
                {contest.name} - 公告與問題討論區
              </p>
              <ContestClarifications 
                contestId={contest.id} 
                isTeacherOrAdmin={['teacher', 'admin'].includes(contest.currentUserRole || '')}
                problems={contest.problems}
                contestStatus={contest.status}
              />
            </ContainerCard>
          </div>
        </div>
      </div>
    </SurfaceSection>
  );
};

export default ContestQAPage;
