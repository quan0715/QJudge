import React, { useState, useEffect } from 'react';
import { Button, Modal } from '@carbon/react';
import { PlayFilled, Login, Flag, WarningAltFilled } from '@carbon/icons-react';

import type { ContestDetail } from '@/core/entities/contest.entity';
import ContestTabs from './ContestTabs';
import { Tag } from '@carbon/react';
import { Time, UserMultiple, Catalog } from '@carbon/icons-react';
import ReactMarkdown from 'react-markdown';
import { ContestStatusBadge } from '@/ui/components/badges/ContestStatusBadge';
import { HeroBase } from '@/ui/components/layout/HeroBase';
import { DataCard } from '@/ui/components/DataCard';
import './ContestHero.css';

const MinimalProgressBar = ({ value, label, status }: { value: number, label?: string, status?: string }) => {
  const isFinished = status === 'ended' || status === 'FINISHED';
  const isActive = status === 'active';

  return (
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
      <div className="contest-progress-bar-container">
        <div 
          className={`contest-progress-bar-fill ${isActive ? 'active' : ''} ${isFinished ? 'finished' : ''}`}
          style={{ width: `${value}%` }} 
        />
      </div>
    </div>
  );
};

interface ContestHeroProps {
  contest: ContestDetail | null;
  loading?: boolean;
  onJoin?: () => void;
  onLeave?: () => void;
  onStartExam?: () => void;
  onEndExam?: () => void;
  onTabChange?: (tab: string) => void;
  maxWidth?: string;
}

const ContestHero: React.FC<ContestHeroProps> = ({ 
  contest, 
  loading, 
  onJoin, 
  onStartExam, 
  onEndExam,
  maxWidth
}) => {
  const [progress, setProgress] = useState(0);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  
  useEffect(() => {
    if (!contest) return;

    const updateProgress = () => {
      const now = new Date().getTime();
      const start = new Date(contest.startTime).getTime();
      const end = new Date(contest.endTime).getTime();
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
    // Pass empty props to HeroBase for loading state
    return <HeroBase title="" loading={true} maxWidth={maxWidth} />;
  }

  // --- Logic from ContestHeroBase ---
  const startTime = new Date(contest.startTime);
  const endTime = new Date(contest.endTime);

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

  const badges = (
    <>
      <ContestStatusBadge status={contest.status} />
      <Tag type={contest.visibility === 'public' ? 'green' : 'purple'}>
        {contest.visibility === 'public' ? '公開' : '私有'}
      </Tag>
      {contest.examModeEnabled && (
        <Tag type="red">考試模式</Tag>
      )}
    </>
  );

  const metadata = (
    <>
      <div>
        <div style={{ marginBottom: '0.25rem' }}>Start Time</div>
        <div style={{ color: 'var(--cds-text-primary)', fontWeight: 600 }}>{formatDate(startTime)}</div>
      </div>
      <div>
        <div style={{ marginBottom: '0.25rem' }}>End Time</div>
        <div style={{ color: 'var(--cds-text-primary)', fontWeight: 600 }}>{formatDate(endTime)}</div>
      </div>
    </>
  );

  const kpiCards = (
    <>
      <DataCard 
        icon={UserMultiple} 
        value={contest.participantCount || 0} 
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
    </>
  );

  const progressBar = (
    <MinimalProgressBar 
      value={progress} 
      label={contest.status === 'active' ? `考試進度 · ${Math.round(progress)}%` : '考試未啟用'} 
      status={contest.status}
    />
  );
  // ----------------------------------

  const handleStartClick = () => {
    if (contest.examModeEnabled) {
      setShowStartConfirm(true);
    } else {
      onStartExam?.();
    }
  };

  const handleEndClick = () => {
    setShowEndConfirm(true);
  };

  // Wrapper for onJoin to match the prop name expected by the button
  // const onJoinContest = onJoin; 
  // We use handleJoinClick instead

  const renderActions = () => {
    // Step 0: Not registered
    if (!contest.hasJoined) {
      return (
        <Button renderIcon={Login} onClick={onJoin}>
          立即報名 (Register)
        </Button>
      );
    }

    // Contest must be active for exam actions
    if (contest.status !== 'active') {
      return (
        <Button kind="secondary" disabled renderIcon={Flag}>
          考試未啟用 (Contest Inactive)
        </Button>
      );
    }

    // Determine my status
    const examStatus = contest.examStatus || (contest.hasStarted ? 'in_progress' : 'not_started');

    switch (examStatus) {
      case 'locked':
        // Step 2.5: Locked - show lock info
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem', backgroundColor: 'var(--cds-layer-01)', borderLeft: '4px solid #da1e28' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#da1e28', fontWeight: 'bold' }}>
              <WarningAltFilled /> 考試已鎖定 (Locked)
            </div>
            <div>{contest.lockReason}</div>
            {contest.allowAutoUnlock && contest.autoUnlockMinutes && contest.lockedAt ? (
              <div style={{ fontSize: '0.9rem', color: '#42be65' }}>
                預計解鎖時間: {new Date(new Date(contest.lockedAt).getTime() + contest.autoUnlockMinutes * 60000).toLocaleTimeString()}
              </div>
            ) : (
              <div style={{ fontSize: '0.9rem', color: '#8d8d8d' }}>請聯繫監考人員解鎖</div>
            )}
          </div>
        );

      case 'submitted':
        // Step 3: Submitted - show finished or allow restart
        if (contest.allowMultipleJoins) {
          return (
            <Button renderIcon={PlayFilled} onClick={handleStartClick}>
              重新開始考試 (Restart Exam)
            </Button>
          );
        }
        return (
          <Button kind="secondary" disabled renderIcon={Flag}>
            已交卷 (Finished)
          </Button>
        );

      case 'paused':
        // Step 1 (paused): Needs to resume - show resume button
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ padding: '0.75rem', backgroundColor: 'var(--cds-layer-01)', borderLeft: '4px solid #f1c21b', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f1c21b', fontWeight: 'bold' }}>
                <WarningAltFilled /> 考試已暫停 (Paused)
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--cds-text-secondary)', marginTop: '0.25rem' }}>
                請點擊繼續考試以重新進入考試模式
              </div>
            </div>
            <Button renderIcon={PlayFilled} onClick={handleStartClick}>
              繼續考試 (Resume Exam)
            </Button>
          </div>
        );

      case 'in_progress':
        // Step 2: In progress - show end exam button
        return (
          <div style={{ display: 'flex', gap: '1rem' }}>
            {onEndExam && (
              <Button kind="danger--tertiary" renderIcon={Flag} onClick={handleEndClick}>
                結束考試 (Submit Exam)
              </Button>
            )}
          </div>
        );

      case 'not_started':
      default:
        // Step 1 (not started): Show start button
        return (
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Button renderIcon={PlayFilled} onClick={handleStartClick}>
              開始考試 (Start Exam)
            </Button>
          </div>
        );
    }
  };

  return (
    <>
      <HeroBase
        title={contest.name}
        description={<ReactMarkdown>{contest.description || 'No description provided.'}</ReactMarkdown>}
        badges={badges}
        metadata={metadata}
        actions={renderActions()}
        kpiCards={kpiCards}
        progressBar={progressBar}
        bottomContent={
          <ContestTabs 
            contest={contest} 
            maxWidth={maxWidth}
          />
        }
        loading={loading}
        maxWidth={maxWidth}
      />

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
            <li>若違規次數超過 <strong>{contest.maxCheatWarnings}</strong> 次，系統將自動鎖定您的考試權限。</li>
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
    </>
  );
};

export default ContestHero;
