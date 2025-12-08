import { useState, useEffect } from 'react';
import { Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Header,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  Theme,
  Modal,
  HeaderNavigation,
  HeaderMenu,
  HeaderMenuItem,
  SkeletonText
} from '@carbon/react';
import {
  Maximize,
  Minimize,
  View,
  Logout,
  Time,
  Renew,
  Locked
} from '@carbon/icons-react';
import { useTheme } from '@/ui/theme/ThemeContext';
import { Light, Asleep } from '@carbon/icons-react';
import ExamModeWrapper from '@/domains/contest/components/ExamModeWrapper';
import { 
  getContest, 
  registerContest, 
  leaveContest,
  startExam, 
  endExam 
} from '@/services/contest';
import type { ContestDetail } from '@/core/entities/contest.entity';
import ContestHero from '@/domains/contest/components/layout/ContestHero';
import { ContentPage } from '@/ui/layout/ContentPage';
import { UserAvatarDisplay } from '@/ui/components/UserAvatarDisplay';
import { ContestProvider } from '@/domains/contest/contexts/ContestContext';
import { ExamModeMonitorModel } from '@/domains/contest/components/Model/ExamModeMonitorModel';


const ContestLayout = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('00:00:00');
  const [isCountdownToStart, setIsCountdownToStart] = useState(false);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [monitoringModalOpen, setMonitoringModalOpen] = useState(false);
  const [unlockTimeLeft, setUnlockTimeLeft] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();

  // Detect if we're on a solve page - hide hero/tabs for cleaner UI
  const isSolvePage = location.pathname.includes('/solve/');

  const isExamActive = !!(
    contest?.examModeEnabled && 
    contest?.examStatus === 'in_progress'
  );

  // Should warn on exit: when exam is in_progress or paused (not yet submitted)
  const shouldWarnOnExit = !!(
    contest?.examModeEnabled &&
    contest?.status === 'active' &&
    (contest?.examStatus === 'in_progress' || contest?.examStatus === 'paused')
  );



  useEffect(() => {
    if (contestId) {
      getContest(contestId).then(c => setContest(c || null));
    }
  }, [contestId]);

  // Redirect paused users to overview
  useEffect(() => {
    if (contest?.examStatus === 'paused') {
      const path = window.location.pathname;
      const restrictedPaths = ['/problems', '/submissions', '/standings'];
      if (restrictedPaths.some(p => path.includes(p))) {
        navigate(`/contests/${contestId}`);
      }
    }
  }, [contest, contestId, navigate]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isExamActive) {
        e.preventDefault();
      }
    };

    if (isExamActive) {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isExamActive]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!contest) return;

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const start = new Date(contest.startTime).getTime();
      const end = new Date(contest.endTime).getTime();
      
      // Determine which target time to countdown to
      const contestNotStartedYet = now < start;
      setIsCountdownToStart(contestNotStartedYet);
      const targetTime = contestNotStartedYet ? start : end;
      const diff = targetTime - now;

      if (diff <= 0) {
        // Timer expired (Start or End reached) - refresh to update status
        refreshContest();
        setTimeLeft('00:00:00');
        clearInterval(timer);
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(
          `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        );
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [contest]);

  // Unlock countdown timer
  useEffect(() => {
    if (!contest || contest.examStatus !== 'locked' || !contest.autoUnlockAt) {
      setUnlockTimeLeft(null);
      return;
    }

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const unlockTime = new Date(contest.autoUnlockAt!).getTime();
      const diff = unlockTime - now;

      if (diff <= 0) {
        setUnlockTimeLeft('00:00:00');
        clearInterval(timer);
        // Auto-refresh to get updated status
        refreshContest();
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setUnlockTimeLeft(
          `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        );
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [contest]);

  const refreshContest = async () => {
    if (contestId) {
      const c = await getContest(contestId);
      setContest(c || null);
    }
  };

  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setErrorModalOpen(true);
  };

  const handleJoin = async (data?: { nickname?: string; password?: string }) => {
    if (!contest) return;
    try {
      await registerContest(contest.id, data);
      await refreshContest();
    } catch (error: any) {
      console.error('Failed to join contest:', error);
      showError(error.message || '無法加入競賽，請檢查密碼或稍後再試');
    }
  };

  const handleLeave = async () => {
    if (!contest) return;
    if (!confirm('確定要退出此競賽嗎？')) return;
    try {
      await leaveContest(contest.id);
      await refreshContest();
    } catch (error) {
      console.error('Failed to leave contest:', error);
      showError('無法退出競賽，請稍後再試');
    }
  };

  const handleStartExam = async () => {
    if (!contest) return;
    try {
      // Call start exam API and wait for response
      const response = await startExam(contest.id);
      
      // Only proceed if API call was successful
      if (response && (response.status === 'started' || response.status === 'resumed')) {
        // Request fullscreen if exam mode is enabled
        if (contest.examModeEnabled) {
          try {
            await document.documentElement.requestFullscreen();
          } catch (err) {
            console.error('Failed to enter fullscreen:', err);
          }
        }

        // Refresh contest data to get updated exam_status
        await refreshContest();
        // Navigate to problems after starting
        navigate(`/contests/${contest.id}/problems`);
      } else {
        // If response indicates failure, show error
        throw new Error(response?.error || 'Unknown error');
      }
    } catch (error: any) {
      console.error('Failed to start exam:', error);
      // Show specific error message if available
      const errorMessage = error?.response?.data?.error || error?.message || '無法開始考試，請稍後再試';
      showError(errorMessage);
    }
  };

  const handleEndExam = async () => {
    if (!contest) return;
    // Confirmation is now handled by the caller (e.g., ContestHero)
    try {
      await endExam(contest.id);
      await refreshContest();
    } catch (error) {
      console.error('Failed to end exam:', error);
      showError('無法交卷，請稍後再試');
    }
  };

  const handleExit = async () => {
    if (!contestId || !contest) return;

    try {
      // If exam mode is enabled and exam is in_progress or paused, end the exam first (submit)
      if (contest.examModeEnabled && contest.status === 'active' && 
          (contest.examStatus === 'in_progress' || contest.examStatus === 'paused')) {
        await handleEndExam();
      }
      
      // Exit fullscreen if active
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch (e) {
          console.error('Failed to exit fullscreen:', e);
        }
      }
      
      // Then navigate away
      navigate('/contests');
    } catch (error) {
      console.error('Failed to leave contest', error);
      showError('無法離開競賽，請稍後再試');
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (err) {
      console.error('Error toggling fullscreen:', err);
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Theme theme={theme}>
        <Header aria-label="Contest Platform">
          <HeaderName 
            href={`/contests/${contestId}`} 
            prefix="QJudge"
            onClick={(e) => {
              e.preventDefault();
              navigate(`/contests/${contestId}`);
            }}
          >
            {contest?.name || '競賽模式'}
          </HeaderName>
          <HeaderNavigation aria-label="Contest Navigation">
            {isSolvePage && contest?.problems && contest.problems.length > 0 && (
              <HeaderMenu aria-label="Problems" menuLinkName="題目列表">
                {contest.problems.map((problem, index) => (
                  <HeaderMenuItem
                    key={problem.id}
                    onClick={() => navigate(`/contests/${contestId}/solve/${problem.problemId}`)}
                  >
                    {problem.label || String.fromCharCode(65 + index)}. {problem.title}
                  </HeaderMenuItem>
                ))}
              </HeaderMenu>
            )}
          </HeaderNavigation>
          <HeaderGlobalBar>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              color: contest?.examStatus === 'locked' ? 'var(--cds-support-error)' : 'var(--cds-text-primary)', 
              marginRight: '2rem',
              fontFamily: 'monospace',
              fontSize: '1rem',
              fontWeight: 'bold'
            }}>
              {contest?.examStatus === 'locked' ? (
                <Locked style={{ marginRight: '0.5rem' }} />
              ) : (
                <Time style={{ marginRight: '0.5rem' }} />
              )}
              {!contest ? (
                <SkeletonText width="100px" />
              ) : contest.examStatus === 'locked' && unlockTimeLeft ? (
                <span title="解鎖倒數">
                  🔓 {unlockTimeLeft}
                </span>
              ) : (
                <span>
                  {isCountdownToStart ? `距開始 ${timeLeft}` : timeLeft}
                </span>
              )}
            </div>
            
            <HeaderGlobalAction 
              aria-label={theme === 'white' ? 'Switch to Dark Mode' : 'Switch to Light Mode'} 
              tooltipAlignment="center"
              onClick={toggleTheme}
            >
              {theme === 'white' ? <Asleep size={20} /> : <Light size={20} />}
            </HeaderGlobalAction>

            <HeaderGlobalAction
              aria-label="重新整理競賽資訊"
              tooltipAlignment="center"
              onClick={refreshContest}
            >
              <Renew size={20} />
            </HeaderGlobalAction>

            <HeaderGlobalAction
              aria-label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
              tooltipAlignment="center"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </HeaderGlobalAction>

            <HeaderGlobalAction 
              aria-label="Exit Contest" 
              tooltipAlignment="center" 
              onClick={() => setIsExitModalOpen(true)}
            >
              <Logout size={20} />
            </HeaderGlobalAction>

            {/* Removed separate End Exam button - Exit Contest now handles this */}

            {isExamActive && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginRight: '1rem',
                  cursor: 'pointer',
                  color: 'var(--cds-support-error)',
                  fontWeight: 600
                }}
                onClick={() => setMonitoringModalOpen(true)}
              >
                <View style={{ marginRight: '0.5rem' }} />
                Monitoring Active
              </div>
            )}
            
            {/* User Info Display */}
            <UserAvatarDisplay />
      </HeaderGlobalBar>
        </Header>

      {/* Monitoring Warning Modal */}
        <ExamModeMonitorModel
          open={monitoringModalOpen}
          onRequestClose={() => setMonitoringModalOpen(false)}
        />
      </Theme>

        <Theme theme={theme} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ marginTop: '3rem', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--cds-background)' }}>
            <ContentPage
              hero={!isSolvePage ? (
                <ContestHero 
                  contest={contest} 
                  onJoin={handleJoin}
                  onLeave={handleLeave}
                  onStartExam={handleStartExam}
                  onEndExam={handleEndExam}
                  onRefreshContest={refreshContest}
                  maxWidth="1056px"
                />
              ) : undefined}
            >
              <ExamModeWrapper
                contestId={contestId || ''}
                examModeEnabled={!!contest?.examModeEnabled}
                isActive={!!isExamActive}
                isLocked={contest?.examStatus === 'locked'}
                lockReason={contest?.lockReason}
                examStatus={contest?.examStatus}
                currentUserRole={contest?.currentUserRole}
                onRefresh={refreshContest}
              >
                <ContestProvider initialContest={contest} onRefresh={refreshContest}>
                  <Outlet context={{ refreshContest }} />
                </ContestProvider>
              </ExamModeWrapper>
            </ContentPage>
          </div>
        </Theme>

      <Modal
        open={isExitModalOpen}
        modalHeading={shouldWarnOnExit ? '確認交卷並離開' : '確認離開競賽'}
        primaryButtonText={shouldWarnOnExit ? '交卷並離開' : '確認離開'}
        secondaryButtonText="取消"
        onRequestClose={() => {
          // Just close the modal, don't force fullscreen
          setIsExitModalOpen(false);
        }}
        onRequestSubmit={handleExit}
        danger={shouldWarnOnExit}
      >
        <p>
          {(() => {
            // Teacher/Admin
            if (contest?.currentUserRole === 'teacher' || contest?.currentUserRole === 'admin') {
              return '確定要離開競賽管理頁面嗎？';
            }

            // Student - Not joined
            if (!contest?.hasJoined && !contest?.isRegistered) {
              return '確定要離開競賽頁面嗎？';
            }

            // Student - Joined but exam not started (or submitted)
            if (!contest?.status || contest.status === 'inactive' || contest.examStatus === 'submitted' || contest.examStatus === 'not_started') {
              return '確定要離開競賽頁面嗎？';
            }

            // Student - Exam in progress or paused (warn about auto-submit)
            return (
              <span>
                <strong style={{ color: 'var(--cds-support-error)' }}>⚠️ 警告：離開將會自動交卷！</strong>
                <br /><br />
                您的考試狀態為「{contest?.examStatus === 'in_progress' ? '進行中' : '暫停中'}」。
                <br />
                確認離開後，系統將自動為您交卷，您將無法再作答。
                <br /><br />
                確定要交卷並離開嗎？
              </span>
            );
          })()}
        </p>
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
    </div>
  );
};

export default ContestLayout;
