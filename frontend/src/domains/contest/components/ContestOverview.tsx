import { Button } from '@carbon/react';
import { Time } from '@carbon/icons-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ContainerCard from '@/ui/components/layout/ContainerCard';
import SurfaceSection from '@/ui/components/layout/SurfaceSection';
import { SubmissionStatusBadge } from '@/ui/components/badges/SubmissionStatusBadge';
import type { ContestDetail, ScoreboardRow } from '@/core/entities/contest.entity';
import type { Submission } from '@/core/entities/submission.entity';

interface ContestOverviewProps {
  contest: ContestDetail;
  myRank: ScoreboardRow | null;
  mySubmissions: Submission[];
  onSubmissionClick: (submissionId: string) => void;
  onViewAllSubmissions: () => void;
  maxWidth?: string;
}

export const ContestOverview: React.FC<ContestOverviewProps> = ({
  contest,
  myRank,
  mySubmissions,
  onSubmissionClick,
  onViewAllSubmissions,
  maxWidth
}) => {


  return (
    <SurfaceSection maxWidth={maxWidth}>
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

            {/* Right Column: Stats or other info (previously registration was here) */}
            <div className="cds--col-lg-6 cds--col-md-8">
              {/* Only show stats if joined, otherwise maybe show something else or nothing */}
              {(contest.hasJoined || contest.isRegistered) && new Date(contest.startTime) <= new Date() && (
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
                          onClick={() => onSubmissionClick(sub.id.toString())}
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
                            {new Date(sub.createdAt).toLocaleString()}
                          </div>
                        </div>
                      ))}
                      <div style={{ marginTop: '1rem', textAlign: 'right' }}>
                        <Button kind="ghost" size="sm" onClick={onViewAllSubmissions}>
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
              )}
            </div>
        </div>
      </div>
    </SurfaceSection>
  );
};
