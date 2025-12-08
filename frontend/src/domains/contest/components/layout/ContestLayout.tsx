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
  Settings,
  Renew
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
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [monitoringModalOpen, setMonitoringModalOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  // Detect if we're on a solve page - hide hero/tabs for cleaner UI
  const isSolvePage = location.pathname.includes('/solve/');

  const isExamActive = !!(
    contest?.examModeEnabled && 
    contest?.examStatus === 'in_progress'
  );

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        setCurrentUser(JSON.parse(userStr));
      } catch (e) {
        console.error('Failed to parse user from local storage', e);
      }
    }
  }, []);

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
        if (contestNotStartedYet) {
          // Contest just started - refresh to update status
          refreshContest();
        }
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

  const refreshContest = async () => {
    if (contestId) {
      const c = await getContest(contestId);
      setContest(c || null);
    }
  };

  const handleJoin = async () => {
    if (!contest) return;
    try {
      await registerContest(contest.id);
      await refreshContest();
    } catch (error) {
      console.error('Failed to join contest:', error);
      alert('無法加入競賽，請稍後再試');
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
      alert('無法退出競賽，請稍後再試');
    }
  };

  const handleStartExam = async () => {
    if (!contest) return;
    try {
      await startExam(contest.id);
      
      // Request fullscreen if exam mode is enabled
      if (contest.examModeEnabled) {
        try {
          await document.documentElement.requestFullscreen();
        } catch (err) {
          console.error('Failed to enter fullscreen:', err);
        }
      }

      await refreshContest();
      // Navigate to problems after starting
      navigate(`/contests/${contest.id}/problems`);
    } catch (error) {
      console.error('Failed to start exam:', error);
      alert('無法開始考試，請稍後再試');
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
      alert('無法交卷，請稍後再試');
    }
  };

  const handleExit = async () => {
    if (!contestId || !contest) return;

    try {
      // If exam mode is enabled and exam is active, end the exam first
      if (contest.examModeEnabled && contest.status === 'active' && contest.examStatus !== 'submitted') {
        // Use the new handleEndExam logic
        await handleEndExam();
      }
      
      // Then navigate away
      navigate('/contests');
    } catch (error) {
      console.error('Failed to leave contest', error);
      alert('無法離開競賽，請稍後再試');
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
              color: 'var(--cds-text-primary)', 
              marginRight: '2rem',
              fontFamily: 'monospace',
              fontSize: '1rem',
              fontWeight: 'bold'
            }}>
              <Time style={{ marginRight: '0.5rem' }} />
              {!contest ? (
                <SkeletonText width="100px" />
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

            {(contest?.currentUserRole === 'teacher' || contest?.currentUserRole === 'admin' || currentUser?.role === 'teacher' || currentUser?.role === 'admin') && (
              <HeaderGlobalAction 
                aria-label="Manage Contest" 
                tooltipAlignment="center" 
                onClick={() => navigate(`/management/contests/${contestId}`)}
              >
                <Settings size={20} />
              </HeaderGlobalAction>
            )}

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
        modalHeading="確認離開競賽"
        primaryButtonText="確認離開"
        secondaryButtonText="取消"
        onRequestClose={() => {
          // Reenter to full screen mode
          if (!isFullscreen) {
            toggleFullscreen()
          }
          setIsExitModalOpen(false)
        }}
        onRequestSubmit={handleExit}
        danger
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
            if (!contest?.status || contest.status === 'inactive' || contest.examStatus === 'submitted') {
              return '確定要離開競賽頁面嗎？';
            }

            // Student - Exam in progress
            return (
              <span>
                警告：競賽正在進行中。
                <br />
                {contest?.allowMultipleJoins ? (
                  '您可以隨時重新進入繼續作答。'
                ) : (
                  <span style={{ color: 'var(--cds-support-error)' }}>
                    注意：若離開競賽，計時器可能不會暫停（視競賽規則而定）。
                  </span>
                )}
                <br />
                確定要現在離開嗎？
              </span>
            );
          })()}
        </p>
      </Modal>
    </div>
  );
};

export default ContestLayout;
