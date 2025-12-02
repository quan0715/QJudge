import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal } from '@carbon/react';
import { PlayFilled, Login, Flag, WarningAltFilled, Settings } from '@carbon/icons-react';
import type { ContestDetail } from '@/models/contest';
import ContestTabs from './ContestTabs';
import ContestHeroBase from './ContestHeroBase';

interface ContestHeroProps {
  contest: ContestDetail | null;
  loading?: boolean;
  onJoin?: () => void;
  onLeave?: () => void;
  onStartExam?: () => void;
  onEndExam?: () => void;
  onTabChange?: (tab: string) => void;
}

const ContestHero: React.FC<ContestHeroProps> = ({ 
  contest, 
  loading, 
  onJoin, 
  onStartExam, 
  onEndExam,
}) => {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

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
    return <ContestHeroBase contest={{} as any} progress={0} loading={true} />;
  }

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

  const renderActions = () => {
    if (!contest.has_joined) {
      return (
        <Button renderIcon={Login} onClick={onJoinContest}>
          立即報名 (Register)
        </Button>
      );
    }

    if (contest.status !== 'active') {
      return (
        <Button kind="secondary" disabled renderIcon={Flag}>
          考試已結束 (Contest Ended)
        </Button>
      );
    }

    if (contest.has_finished_exam) {
      if (contest.allow_multiple_joins) {
        return (
          <Button renderIcon={PlayFilled} onClick={handleStartClick}>
            重新開始考試 (Start Exam)
          </Button>
        );
      }
      return (
        <Button kind="secondary" disabled renderIcon={Flag}>
          已交卷 (Finished)
        </Button>
      );
    }

    // Active and Joined and Not Finished
    if (contest.is_locked) {
      return (
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
      );
    }

    return (
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
    );
  };

  return (
    <>
      <ContestHeroBase 
        contest={contest} 
        progress={progress}
        actions={renderActions()}
        bottomContent={<ContestTabs contest={contest} />}
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
    </>
  );
};

export default ContestHero;
