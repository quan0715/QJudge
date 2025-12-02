import React, { useState, useEffect } from 'react';
import { Button, Tag, SkeletonText, ProgressBar } from '@carbon/react';
import { Time, UserMultiple, Catalog, PlayFilled, Exit, Login, Flag } from '@carbon/icons-react';
import type { ContestDetail } from '@/models/contest';
import ContestTabs from './ContestTabs';

interface ContestHeroProps {
  contest: ContestDetail | null;
  loading?: boolean;
  onJoin?: () => void;
  onLeave?: () => void;
  onStartExam?: () => void;
  onEndExam?: () => void;
}

// Simple hook for media query
const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }
    const listener = () => setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [matches, query]);
  return matches;
};

const ContestHero: React.FC<ContestHeroProps> = ({ contest, loading, onJoin, onLeave, onStartExam, onEndExam }) => {
  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const isMobile = useMediaQuery('(max-width: 1056px)'); // Carbon lg breakpoint

  useEffect(() => {
    if (!contest) return;

    const updateProgress = () => {
      const now = new Date().getTime();
      const start = new Date(contest.start_time).getTime();
      const end = new Date(contest.end_time).getTime();
      const total = end - start;
      const elapsed = now - start;

      if (now < start) {
        setProgress(0);
        setTimeLeft('Not Started');
      } else if (now > end) {
        setProgress(100);
        setTimeLeft('Finished');
      } else {
        const p = (elapsed / total) * 100;
        setProgress(Math.min(100, Math.max(0, p)));
        
        // Calculate remaining time
        const remaining = end - now;
        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        setTimeLeft(`${hours}h ${minutes}m remaining`);
      }
    };

    updateProgress();
    const timer = setInterval(updateProgress, 60000); // Update every minute
    return () => clearInterval(timer);
  }, [contest]);

  if (loading || !contest) {
    return (
      <div style={{ padding: '2rem', backgroundColor: 'var(--cds-layer-02)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
        <SkeletonText heading width="30%" />
        <SkeletonText width="20%" />
      </div>
    );
  }

  const now = new Date();
  const startTime = new Date(contest.start_time);
  const endTime = new Date(contest.end_time);
  
  let status: 'UPCOMING' | 'RUNNING' | 'FINISHED' = 'UPCOMING';
  if (now > endTime) status = 'FINISHED';
  else if (now >= startTime) status = 'RUNNING';

  const getDuration = () => {
    const diff = endTime.getTime() - startTime.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) return `${Math.floor(hours / 24)} Days`;
    if (minutes > 0) return `${hours}h ${minutes}m`;
    return `${hours}h`;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleString('zh-TW', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const DataCard = ({ icon: Icon, value, label }: { icon: any, value: string | number, label: string }) => (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      padding: '0 2rem',
      borderLeft: '1px solid var(--cds-border-subtle)',
      minWidth: '140px',
      alignItems: 'flex-start'
    }}>
      <div style={{ marginBottom: '0.5rem', color: 'var(--cds-text-secondary)' }}>
        <Icon size={20} />
      </div>
      <div style={{ fontSize: '2.5rem', fontWeight: 300, lineHeight: 1, marginBottom: '0.25rem' }}>
        {value}
      </div>
      <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
        {label}
      </div>
    </div>
  );

  const MinimalProgressBar = ({ value, label }: { value: number, label?: string }) => (
    <div style={{ width: '100%', marginTop: '0', marginBottom: '1.25rem' }}>
      {label && (
        <div style={{ 
          marginBottom: '0.5rem', 
          fontSize: '0.875rem', 
          color: 'var(--cds-text-secondary)',
          fontFamily: 'var(--cds-font-family)'
        }}>
          {label}
        </div>
      )}
      <div style={{ 
        height: '6px', 
        width: '100%', 
        backgroundColor: 'var(--cds-border-subtle)', 
        position: 'relative' 
      }}>
        <div style={{ 
          height: '100%', 
          width: `${value}%`, 
          backgroundColor: 'var(--cds-interactive)',
          transition: 'width 0.3s ease'
        }} />
      </div>
    </div>
  );

  return (
    <div style={{ 
      backgroundColor: 'var(--cds-layer-02)',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div className="cds--grid" style={{ 
        paddingLeft: '2.5rem', 
        paddingRight: '2.5rem',
        paddingTop: '3rem',
        paddingBottom: '0',
        maxWidth: '100%',
        margin: 0,
        flex: 1
      }}>
        {/* HeroTopRow: Custom Flex Layout */}
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'flex-start' : 'center',
          gap: '2rem',
          flexWrap: isMobile ? 'wrap' : 'nowrap',
          marginBottom: '2rem'
        }}>
          {/* HeroInfoColumn (Left) */}
          <div style={{ 
            flex: isMobile ? '1 1 auto' : '1 1 65%', 
            display: 'flex', 
            flexDirection: 'column',
            maxWidth: isMobile ? '100%' : '70%'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <Tag type={status === 'RUNNING' ? 'green' : status === 'UPCOMING' ? 'blue' : 'gray'}>
                {status}
              </Tag>
              {contest.visibility === 'private' && <Tag type="outline">Private</Tag>}
              {contest.exam_mode_enabled && <Tag type="purple">Exam Mode</Tag>}
            </div>
            
            <h1 style={{ 
              fontSize: '3rem', 
              fontWeight: 300, 
              marginBottom: '1rem',
              color: 'var(--cds-text-primary)',
              lineHeight: 1.1
            }}>
              {contest.name}
            </h1>
            
            <p style={{ 
              fontSize: '1rem', 
              color: 'var(--cds-text-secondary)',
              marginBottom: '1.5rem',
              maxWidth: '600px',
              lineHeight: 1.6
            }}>
              {contest.description || 'No description provided.'}
            </p>

            {/* Start / End Time */}
            <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem', color: 'var(--cds-text-secondary)', fontSize: '0.875rem' }}>
              <div>
                <div style={{ marginBottom: '0.25rem' }}>Start Time</div>
                <div style={{ color: 'var(--cds-text-primary)', fontWeight: 600 }}>{formatDate(startTime)}</div>
              </div>
              <div>
                <div style={{ marginBottom: '0.25rem' }}>End Time</div>
                <div style={{ color: 'var(--cds-text-primary)', fontWeight: 600 }}>{formatDate(endTime)}</div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              {!contest.has_joined && status !== 'FINISHED' && onJoin && (
                <Button renderIcon={Login} onClick={onJoin}>
                  Join Contest
                </Button>
              )}
              
              {contest.has_joined && status !== 'FINISHED' && (
                <>
                  {contest.exam_mode_enabled ? (
                    <>
                      {!contest.has_started && onStartExam && (
                        <Button renderIcon={PlayFilled} onClick={onStartExam}>
                          Start Exam
                        </Button>
                      )}
                      {contest.has_started && !contest.has_finished_exam && onEndExam && (
                        <Button kind="danger" renderIcon={Flag} onClick={onEndExam}>
                          Submit Exam
                        </Button>
                      )}
                      {contest.has_started && !contest.has_finished_exam && (
                         <Button kind="secondary" renderIcon={PlayFilled} onClick={() => {}}>
                           Continue
                         </Button>
                      )}
                    </>
                  ) : (
                     <Button renderIcon={PlayFilled}>
                       Enter Contest
                     </Button>
                  )}
                  
                  {onLeave && (
                    <Button kind="ghost" renderIcon={Exit} onClick={onLeave}>
                      Leave
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* HeroKpiColumn (Right) */}
          <div style={{ 
            flex: isMobile ? '1 1 auto' : '0 0 auto', 
            display: 'flex', 
            gap: '0', // Gap handled by padding/border
            alignItems: 'center',
            marginTop: isMobile ? '2rem' : 0
          }}>
            <DataCard 
              icon={UserMultiple} 
              value={contest.participant_count || 0} 
              label="Participants" 
            />
            <DataCard 
              icon={Catalog} 
              value={contest.problems.length} 
              label="Problems" 
            />
            <DataCard 
              icon={Time} 
              value={getDuration()} 
              label="Duration" 
            />
          </div>
        </div>

        {/* Progress Bar Row */}
        <div className="cds--row">
          <div className="cds--col-lg-16">
            <MinimalProgressBar 
              value={progress} 
              label={status === 'RUNNING' ? `Contest Progress · ${Math.round(progress)}%` : status} 
            />
          </div>
        </div>
      </div>
      
      {/* ContestTabs will be rendered here by parent or if integrated, but currently it's in ContestHero.tsx? 
          Wait, the user said "Tabs 是 Hero 的最底層子元素". 
          But in previous edits, we integrated ContestTabs into ContestHero. 
          Let's check if we need to render it here.
          Ah, the previous file content didn't show ContestTabs being imported or used.
          Let's check imports.
      */}
      <ContestTabs contest={contest} />
    </div>
  );
};

export default ContestHero;
