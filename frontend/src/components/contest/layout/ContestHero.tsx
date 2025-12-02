import React, { useState, useEffect } from 'react';
import { Button, Tag, SkeletonText, ProgressBar, Modal, Tabs, Tab, TabList } from '@carbon/react';
import { Time, UserMultiple, Catalog, PlayFilled, Exit, Login, Flag, Calendar, WarningAltFilled } from '@carbon/icons-react';
import ReactMarkdown from 'react-markdown';
import type { ContestDetail } from '@/models/contest';
import ContestTabs from './ContestTabs';

interface ContestHeroProps {
  contest: ContestDetail | null;
  loading?: boolean;
  onJoin?: () => void;
  onLeave?: () => void;
  onStartExam?: () => void;
  onEndExam?: () => void;
  onTabChange?: (tab: string) => void;
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

const ContestHero: React.FC<ContestHeroProps> = ({ 
  contest, 
  loading, 
  onJoin, 
  onLeave, 
  onStartExam, 
  onEndExam,
  onTabChange = () => {} 
}) => {
  const [progress, setProgress] = useState(0);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
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
      } else if (now > end) {
        setProgress(100);
      } else {
        const p = (elapsed / total) * 100;
        setProgress(Math.min(100, Math.max(0, p)));
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

  const handleStartClick = () => {
    if (contest.exam_mode_enabled) {
      setShowStartConfirm(true);
    } else {
      onStartExam?.();
    }
  };

  const handleEndClick = () => {
    setShowEndConfirm(true);
  };

  // Wrapper for onJoin to match the prop name expected by the button
  const onJoinContest = onJoin;

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
              {!contest.has_joined ? (
                <Button renderIcon={Login} onClick={onJoinContest}>
                  立即報名 (Register)
                </Button>
              ) : (
                <>
                  {contest.status === 'active' && (
                    <>
                      {!contest.has_finished_exam ? (
                        <>
                         {contest.is_locked ? (
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem', backgroundColor: 'var(--cds-layer-01)', borderLeft: '4px solid #da1e28' }}>
                             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#da1e28', fontWeight: 'bold' }}>
                               <WarningAltFilled /> 考試已鎖定
                             </div>
                             <div>{contest.lock_reason}</div>
                             {contest.allow_auto_unlock && contest.auto_unlock_minutes && contest.locked_at ? (
                                <div style={{ fontSize: '0.9rem', color: '#42be65' }}>
                                  預計解鎖時間: {new Date(new Date(contest.locked_at).getTime() + contest.auto_unlock_minutes * 60000).toLocaleTimeString()}
                                </div>
                             ) : (
                               <div style={{ fontSize: '0.9rem', color: '#8d8d8d' }}>請聯繫監考人員解鎖</div>
                             )}
                           </div>
                         ) : (
                           <div style={{ display: 'flex', gap: '1rem' }}>
                             <Button renderIcon={PlayFilled} onClick={handleStartClick}>
                               {contest.has_started ? '繼續考試 (Continue)' : '開始考試 (Start Exam)'}
                             </Button>
                             {contest.has_started && onEndExam && (
                               <Button kind="danger--tertiary" renderIcon={Flag} onClick={handleEndClick}>
                                 結束考試 (Submit Exam)
                               </Button>
                             )}
                           </div>
                         )}
                        </>
                      ) : (
                        contest.allow_multiple_joins ? (
                          <Button renderIcon={PlayFilled} onClick={handleStartClick}>
                            重新開始考試 (Start Exam)
                          </Button>
                        ) : (
                          <Button kind="secondary" disabled renderIcon={Flag}>
                            已交卷 (Finished)
                          </Button>
                        )
                      )}
                    </>
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
              label={status === 'RUNNING' ? `Contest Progress · ${Math.round(progress)}%` : status} 
            />
          </div>
        </div>
      </div>
      
      <ContestTabs contest={contest} />

      {/* Start Exam Confirmation Modal */}
      <Modal
        open={showStartConfirm}
        modalHeading="開始考試確認"
        primaryButtonText="確認開始"
        secondaryButtonText="取消"
        onRequestSubmit={() => {
          setShowStartConfirm(false);
          onStartExam?.();
        }}
        onRequestClose={() => setShowStartConfirm(false)}
        danger
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '1rem', fontWeight: 'bold' }}>
            本場考試已啟用防作弊模式，請仔細閱讀以下規則：
          </p>
          <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', lineHeight: '1.6' }}>
            <li>考試期間請保持<strong>全螢幕模式</strong>。</li>
            <li>禁止切換分頁或視窗，違規將被記錄。</li>
            <li>若違規次數超過 <strong>{contest.max_cheat_warnings}</strong> 次，系統將自動鎖定您的考試權限。</li>
            {contest.ban_tab_switching && (
              <li style={{ color: '#da1e28' }}>嚴格禁止切換分頁 (Tab Switching is Banned)</li>
            )}
          </ul>
          <p>點擊「確認開始」後將進入全螢幕模式。</p>
        </div>
      </Modal>

      {/* End Exam Confirmation Modal */}
      <Modal
        open={showEndConfirm}
        modalHeading="確認交卷"
        primaryButtonText="確認交卷"
        secondaryButtonText="取消"
        onRequestSubmit={() => {
          setShowEndConfirm(false);
          onEndExam?.();
        }}
        onRequestClose={() => setShowEndConfirm(false)}
        danger
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '1rem', fontWeight: 'bold', color: '#da1e28' }}>
            確定要結束考試並交卷嗎？
          </p>
          <p>
            交卷後將<strong>無法再進行作答</strong>，且無法撤銷此操作。請確認您已完成所有題目。
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default ContestHero;
