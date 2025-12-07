import ContestClarifications from '@/domains/contest/components/ContestClarifications';
import { Loading } from '@carbon/react';
import SurfaceSection from '@/ui/components/layout/SurfaceSection';
import ContainerCard from '@/ui/components/layout/ContainerCard';
import { useContest } from '@/domains/contest/contexts/ContestContext';

interface ContestQAPageProps {
  maxWidth?: string;
}

const ContestQAPage: React.FC<ContestQAPageProps> = ({ maxWidth }) => {
  const { contest, loading } = useContest();

  if (loading) return <Loading />;
  if (!contest) return <div>Contest not found</div>;

  return (
    <SurfaceSection maxWidth={maxWidth}>
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
