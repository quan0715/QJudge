import React, { useState } from 'react';
import { Button, InlineNotification } from '@carbon/react';
import { Time, UserFollow } from '@carbon/icons-react';
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
  onRegister?: () => Promise<void>;
  maxWidth?: string;
}

export const ContestOverview: React.FC<ContestOverviewProps> = ({
  contest,
  myRank,
  mySubmissions,
  onSubmissionClick,
  onViewAllSubmissions,
  onRegister,
  maxWidth
}) => {
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasJoined = contest.hasJoined || contest.isRegistered;
  const contestNotStartedYet = new Date(contest.startTime) > new Date();

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

  const handleRegister = async () => {
    if (!onRegister) return;
    setRegistering(true);
    setError(null);
    try {
      await onRegister();
    } catch (e: any) {
      setError(e.message || '註冊失敗');
    } finally {
      setRegistering(false);
    }
  };

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

          {/* Right Column: Registration or Stats */}
          <div className="cds--col-lg-6 cds--col-md-8">
            {/* Registration Card for non-joined users */}
            {!hasJoined && (
              <ContainerCard title="報名狀態" style={{ marginBottom: '1.5rem' }}>
                {error && (
                  <InlineNotification
                    kind="error"
                    title="錯誤"
                    subtitle={error}
                    onClose={() => setError(null)}
                    style={{ marginBottom: '1rem' }}
                  />
                )}
                <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                  <p style={{ marginBottom: '1rem', color: 'var(--cds-text-secondary)' }}>
                    您尚未報名此競賽
                  </p>
                  <Button
                    kind="primary"
                    renderIcon={UserFollow}
                    onClick={handleRegister}
                    disabled={registering}
                  >
                    {registering ? '處理中...' : '報名競賽'}
                  </Button>
                </div>
              </ContainerCard>
            )}

            {/* Stats Card - only for joined users after contest has started */}
            {hasJoined && !contestNotStartedYet && (
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
                          {formatDate(sub.createdAt)}
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
