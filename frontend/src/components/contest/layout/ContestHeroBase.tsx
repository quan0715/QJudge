import React from 'react';
import { Tag, SkeletonText } from '@carbon/react';
import { Time, UserMultiple, Catalog, Calendar } from '@carbon/icons-react';
import ReactMarkdown from 'react-markdown';
import type { ContestDetail } from '@/models/contest';
// Note: Using inline styles for ContestHero components to ensure consistent rendering without external CSS modules.

interface ContestHeroBaseProps {
  contest: ContestDetail;
  progress: number;
  actions?: React.ReactNode;
  bottomContent?: React.ReactNode;
  loading?: boolean;
}

const ContestHeroBase: React.FC<ContestHeroBaseProps> = ({ 
  contest, 
  progress, 
  actions, 
  bottomContent,
  loading 
}) => {
  // Simple hook for media query (duplicated here or we can export it from a hook file)
  // For now, I'll implement a simple check or just use standard responsive classes if possible.
  // The original used a custom hook. I'll include it here for now to ensure visual parity.
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const query = '(max-width: 1056px)';
    const media = window.matchMedia(query);
    setIsMobile(media.matches);
    const listener = () => setIsMobile(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '2rem', backgroundColor: 'var(--cds-layer-02)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
        <SkeletonText heading width="30%" />
        <SkeletonText width="20%" />
      </div>
    );
  }

  const startTime = new Date(contest.start_time);
  const endTime = new Date(contest.end_time);

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'green';
      case 'upcoming': return 'blue';
      case 'ended': return 'gray';
      default: return 'gray';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return '進行中 (Running)';
      case 'upcoming': return '即將開始 (Upcoming)';
      case 'ended': return '已結束 (Ended)';
      default: return status;
    }
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

  const MinimalProgressBar = ({ value, label, status }: { value: number, label?: string, status?: string }) => (
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
          backgroundColor: status === 'ended' || status === 'FINISHED' ? '#8d8d8d' : 'var(--cds-interactive)',
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
        {/* HeroTopRow */}
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
              <Tag type={getStatusColor(contest.status)}>
                {getStatusText(contest.status)}
              </Tag>
              <Tag type={contest.visibility === 'public' ? 'green' : 'purple'}>
                {contest.visibility === 'public' ? '公開' : '私有'}
              </Tag>
              {contest.exam_mode_enabled && (
                <Tag type="red">考試模式</Tag>
              )}
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
            
            <div style={{ 
              fontSize: '1rem', 
              color: 'var(--cds-text-secondary)',
              marginBottom: '1.5rem',
              maxWidth: '600px',
              lineHeight: 1.6
            }}>
              <ReactMarkdown>{contest.description || 'No description provided.'}</ReactMarkdown>
            </div>

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
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              {actions}
            </div>
          </div>

          {/* HeroKpiColumn (Right) */}
          <div style={{ 
            flex: isMobile ? '1 1 auto' : '0 0 auto', 
            display: 'flex', 
            gap: '0', 
            alignItems: 'center',
            marginTop: isMobile ? '2rem' : 0,
            flexWrap: 'wrap'
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
              label={contest.status === 'active' ? `Contest Progress · ${Math.round(progress)}%` : contest.status} 
              status={contest.status}
            />
          </div>
        </div>
      </div>
      
      {bottomContent}
    </div>
  );
};

export default ContestHeroBase;
