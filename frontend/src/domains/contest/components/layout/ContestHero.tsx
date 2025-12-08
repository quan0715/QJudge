import React, { useState, useEffect } from 'react';
import { Button, Modal, TextInput } from '@carbon/react';
import { PlayFilled, Login, Flag, WarningAltFilled } from '@carbon/icons-react';

import type { ContestDetail } from '@/core/entities/contest.entity';
import ContestTabs from './ContestTabs';
import { Tag } from '@carbon/react';
import { Time, UserMultiple, Catalog } from '@carbon/icons-react';
import MarkdownRenderer from '@/ui/components/common/MarkdownRenderer';
import { getContestState, getContestStateLabel, getContestStateColor } from '@/models/contest';
import { HeroBase } from '@/ui/components/layout/HeroBase';
import { DataCard } from '@/ui/components/DataCard';
import { updateNickname } from '@/services/contest';
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
  onJoin?: (data?: { nickname?: string; password?: string }) => void;
  onLeave?: () => void;
  onStartExam?: () => void;
  onEndExam?: () => void;
  onTabChange?: (tab: string) => void;
  onRefreshContest?: () => Promise<void>;
  maxWidth?: string;
}

const ContestHero: React.FC<ContestHeroProps> = ({ 
  contest, 
  loading, 
  onJoin, 
  onStartExam, 
  onEndExam,
  onRefreshContest,
  maxWidth
}) => {
  const [progress, setProgress] = useState(0);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerNickname, setRegisterNickname] = useState('');
  const [password, setPassword] = useState('');
  
  // Update Nickname States
  const [showUpdateNicknameModal, setShowUpdateNicknameModal] = useState(false);
  const [newNickname, setNewNickname] = useState('');
  const [isUpdatingNickname, setIsUpdatingNickname] = useState(false);
  
  // Error Modal State
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setErrorModalOpen(true);
  };

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

  // Calculate time-based state for accurate badge display
  const contestState = getContestState({ status: contest.status, startTime: contest.startTime, endTime: contest.endTime });
  const isEnded = contestState === 'ended';

  const badges = (
    <>
      <Tag type={getContestStateColor(contestState)}>
        {getContestStateLabel(contestState)}
      </Tag>
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
    // Check if contest has ended (time-based)
    if (isEnded) {
      return (
        <Button kind="secondary" disabled renderIcon={Flag}>
          考試已結束 (Exam Ended)
        </Button>
      );
    }

    // Step 0: Not registered
    if (!contest.hasJoined) {
      const handleRegisterClick = () => {
        if (contest.anonymousModeEnabled || contest.visibility === 'private') {
          setShowRegisterModal(true);
        } else {
          onJoin?.();
        }
      };
      return (
        <Button renderIcon={Login} onClick={handleRegisterClick}>
          立即報名 (Register)
        </Button>
      );
    }

    // Determine my status
    const examStatus = contest.examStatus || (contest.hasStarted ? 'in_progress' : 'not_started');

    // Contest must be active for exam actions
    if (contest.status !== 'active') {
      return (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Button kind="secondary" disabled renderIcon={Flag}>
            考試未啟用 (Contest Inactive)
          </Button>
        </div>
      );
    }

    switch (examStatus) {
      case 'locked':
        // Step 2.5: Locked - status is now shown in Navbar
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
             <Button kind="secondary" disabled renderIcon={WarningAltFilled}>
               考試已鎖定 (Exam Locked)
             </Button>
          </div>
        );

      case 'submitted':
        // Step 3: Submitted - show finished or allow restart
        if (contest.allowMultipleJoins) {
          return (
            <div style={{ display: 'flex', alignItems: 'center' }}>
                  <Button renderIcon={PlayFilled} onClick={handleStartClick}>
                重新開始考試 (Restart Exam)
              </Button>
            </div>
          );
        }
        return (
          <div style={{ display: 'flex', alignItems: 'center' }}>
              <Button kind="secondary" disabled renderIcon={Flag}>
              已交卷 (Finished)
            </Button>
          </div>
        );

      case 'paused':
        return (
           <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Button renderIcon={PlayFilled} onClick={handleStartClick}>
               繼續考試 (Resume Exam)
             </Button>
           </div>
        );

      case 'in_progress':
        // Step 2: In progress - show end exam button
        return (
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              {onEndExam && (
              <Button kind="danger--tertiary" renderIcon={Flag} onClick={handleEndClick}>
                結束考試 (Submit Exam)
              </Button>
            )}
            {!onEndExam && (
               <Button kind="secondary" disabled>
                  進行中 (In Progress)
               </Button>
            )}
          </div>
        );

      case 'not_started':
      default:
        // Check if contest hasn't started yet (time-based)
        const contestNotStartedYet = new Date(contest.startTime) > new Date();
        if (contestNotStartedYet) {
          return (
            <Button kind="secondary" disabled renderIcon={PlayFilled}>
              尚未開始 (Not Yet Started)
            </Button>
          );
        }
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
        description={<MarkdownRenderer>{contest.description || 'No description provided.'}</MarkdownRenderer>}
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

      {/* Update Nickname Modal */}
      <Modal
        open={showUpdateNicknameModal}
        modalHeading="修改匿名暱稱"
        primaryButtonText={isUpdatingNickname ? "更新中..." : "確認修改"}
        secondaryButtonText="取消"
        onRequestClose={() => setShowUpdateNicknameModal(false)}
        onRequestSubmit={async () => {
          if (!contest) return;
          setIsUpdatingNickname(true);
          try {
            await updateNickname(contest.id, newNickname);
            setShowUpdateNicknameModal(false);
            if (onRefreshContest) {
              await onRefreshContest();
            } else {
               // Fallback if no refresh function provided (shouldn't happen in updated layout)
               console.warn('No refresh function provided');
            }
          } catch (error: any) {
            console.error('Failed to update nickname', error);
            showError(error.message || '修改失敗，請稍後再試');
          } finally {
            setIsUpdatingNickname(false);
          }
        }}
        primaryButtonDisabled={isUpdatingNickname}
      >
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ marginBottom: '1rem' }}>您可以隨時修改您在積分榜上顯示的暱稱。</p>
          <TextInput
            id="update-nickname"
            labelText="暱稱 (選填)"
            placeholder="請輸入新的暱稱"
            value={newNickname}
            onChange={(e: any) => setNewNickname(e.target.value)}
          />
        </div>
      </Modal>

      {/* Registration Modal */}
      <Modal
        open={showRegisterModal}
        modalHeading="競賽報名"
        primaryButtonText="確認報名"
        secondaryButtonText="取消"
        onRequestSubmit={() => {
          setShowRegisterModal(false);
          onJoin?.({ 
            nickname: registerNickname || undefined,
            password: password || undefined
          });
          setRegisterNickname('');
          setPassword('');
        }}
        onRequestClose={() => {
          setShowRegisterModal(false);
          setRegisterNickname('');
          setPassword('');
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <form onSubmit={(e) => { e.preventDefault(); }}>
          {contest.visibility === 'private' && (
            <div>
              <p style={{ marginBottom: '0.5rem' }}>
                此競賽為私有競賽，請輸入加入密碼。
              </p>
              <TextInput
                id="password"
                labelText="密碼 (Password)"
                type="password"
                placeholder="請輸入競賽密碼"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}

          {contest.anonymousModeEnabled && (
            <div>
              <p style={{ marginBottom: '0.5rem' }}>
                本競賽已啟用<strong>匿名模式</strong>，您可以設定一個暱稱。
                排行榜和提交列表將顯示您的暱稱而非真實帳號。
              </p>
              <TextInput
                id="nickname"
                labelText="暱稱 (Nickname)"
                placeholder="留空則使用預設帳號名稱"
                value={registerNickname}
                onChange={(e: any) => setRegisterNickname(e.target.value)}
                maxLength={50}
              />
              <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginTop: '0.5rem' }}>
                您可以在報名後隨時修改暱稱。
              </p>
            </div>
          )}
          
          {/* Confirmation if no special inputs required but modal opened for some reason? 
              Logic above ensures modal only opens if private or anonymous. 
          */}
          </form>
        </div>
      </Modal>

      {/* Error Modal */}
      <Modal
        open={errorModalOpen}
        modalHeading="錯誤"
        passiveModal
        onRequestClose={() => setErrorModalOpen(false)}
      >
        <p>{errorMessage}</p>
      </Modal>
    </>
  );
};

export default ContestHero;
