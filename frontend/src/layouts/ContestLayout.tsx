import { useState, useEffect } from 'react';
import { Outlet, useParams, useNavigate } from 'react-router-dom';
import {
  Header,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  Theme,
  Button,
  Modal,
  InlineNotification,
  HeaderNavigation
} from '@carbon/react';
import {
  Maximize,
  Minimize,
  UserAvatar,
  View,
  Logout,
  Time,
  Stop,
  Settings
} from '@carbon/icons-react';
import { useTheme } from '@/contexts/ThemeContext';
import { Light, Asleep } from '@carbon/icons-react';
import ExamModeWrapper from '@/components/contest/ExamModeWrapper';
import { api } from '@/services/api';
import type { ContestDetail } from '@/models/contest';
import ContestHero from '@/components/contest/layout/ContestHero';


const ContestLayout = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  // const [searchParams] = useSearchParams();
  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('00:00:00');
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [monitoringModalOpen, setMonitoringModalOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const isExamActive = !!(
    contest?.exam_mode_enabled && 
    contest?.has_started && 
    !contest?.is_paused && 
    !contest?.is_locked &&
    !contest?.has_finished_exam
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
      api.getContest(contestId).then(c => setContest(c || null));
    }
  }, [contestId]);

  // Redirect paused users to overview
  useEffect(() => {
    if (contest?.is_paused) {
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
        e.returnValue = '';
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
      const end = new Date(contest.end_time).getTime();
      const now = new Date().getTime();
      const diff = end - now;

      if (diff <= 0) {
        setTimeLeft('00:00:00');
        clearInterval(timer);
        // Auto exit or show ended message
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
      const c = await api.getContest(contestId);
      setContest(c || null);
    }
  };

  const handleJoin = async () => {
    if (!contest) return;
    try {
      await api.registerContest(contest.id);
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
      await api.leaveContest(contest.id);
      await refreshContest();
    } catch (error) {
      console.error('Failed to leave contest:', error);
      alert('無法退出競賽，請稍後再試');
    }
  };

  const handleStartExam = async () => {
    if (!contest) return;
    try {
      await api.startExam(contest.id);
      
      // Request fullscreen if exam mode is enabled
      if (contest.exam_mode_enabled) {
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
      await api.endExam(contest.id);
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
      if (contest.exam_mode_enabled && contest.status === 'active' && !contest.has_finished_exam) {
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
          <HeaderName href="#" prefix="NYCU">
        Online Judge
      </HeaderName>
      {/* Remove Navigation Links as requested */}
      <HeaderNavigation aria-label="Contest Navigation">
        {/* Empty or minimal navigation if needed */}
      </HeaderNavigation>
          <HeaderGlobalBar>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              color: 'var(--cds-text-primary)', 
              marginRight: '2rem',
              fontFamily: 'monospace',
              fontSize: '1.2rem',
              fontWeight: 'bold'
            }}>
              <Time style={{ marginRight: '0.5rem' }} />
              {timeLeft}
            </div>
            
            <HeaderGlobalAction 
              aria-label={theme === 'white' ? 'Switch to Dark Mode' : 'Switch to Light Mode'} 
              tooltipAlignment="center"
              onClick={toggleTheme}
            >
              {theme === 'white' ? <Asleep size={20} /> : <Light size={20} />}
            </HeaderGlobalAction>

            <HeaderGlobalAction
              aria-label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
              tooltipAlignment="center"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </HeaderGlobalAction>

            {(contest?.current_user_role === 'teacher' || contest?.current_user_role === 'admin' || currentUser?.role === 'teacher' || currentUser?.role === 'admin') && (
              <HeaderGlobalAction 
                aria-label="Manage Contest" 
                tooltipAlignment="center" 
                onClick={() => navigate(`/admin/contests/${contestId}`)}
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
            {false && (
              <div style={{ marginRight: '1rem' }}>
                <Button
                  kind="danger"
                  renderIcon={Stop}
                  size="sm"
                  onClick={() => setIsExitModalOpen(true)}
                >
                  結束競賽（交卷）
                </Button>
              </div>
            )}

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
                監控中 (Monitoring Active)
              </div>
            )}

            {/* Fullscreen Toggle - Removed duplicate Button */}
            
            {/* User Info Display */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.75rem', 
              padding: '0 1rem', 
              borderLeft: '1px solid var(--cds-border-subtle)',
              height: '100%'
            }}>
              <UserAvatar size={20} />
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                  {currentUser?.username || currentUser?.name || 'User'}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                  {currentUser?.role ? (currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)) : 'Student'}
                </span>
              </div>
            </div>
      </HeaderGlobalBar>
    </Header>


{/* Monitoring Warning Modal */}
<Modal
  open={monitoringModalOpen}
  modalHeading="考試監控中 (Monitoring Active)"
  passiveModal
  onRequestClose={() => setMonitoringModalOpen(false)}
>
  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
    <InlineNotification
      kind="warning"
      title="警告"
      subtitle="本考試已啟用防作弊監控系統"
      hideCloseButton
    />
    <div>
      <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>請注意以下規則：</p>
      <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem' }}>
        <li>禁止切換瀏覽器分頁 (Tab Switching)</li>
        <li>禁止離開全螢幕模式 (Exit Fullscreen)</li>
        <li>禁止將視窗縮小或切換至其他應用程式 (Window Blur)</li>
      </ul>
    </div>
    <p style={{ color: 'var(--cds-text-error)' }}>
      違反上述規則將會被系統記錄，超過次數限制將會被<strong>自動鎖定</strong>並無法繼續考試。
    </p>
  </div>
</Modal>    </Theme>

      <Theme theme={theme} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ marginTop: '3rem', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--cds-background)' }}>
          <div className="contest-content" style={{ 
            flex: 1, 
            overflow: 'auto',
            backgroundColor: theme === 'white' ? '#f4f4f4' : '#161616', // Custom background as requested
            position: 'relative'
          }}>
            {/* Hero Section - Scrolls away */}
            <ContestHero 
              contest={contest} 
              onJoin={handleJoin}
              onLeave={handleLeave}
              onStartExam={handleStartExam}
              onEndExam={handleEndExam}
            />



            {/* Main Content */}
            <ExamModeWrapper
              contestId={contestId || ''}
              examModeEnabled={!!contest?.exam_mode_enabled}
              isActive={!!isExamActive}
              isLocked={contest?.is_locked}
              lockReason={contest?.lock_reason}
              currentUserRole={contest?.current_user_role}
            >
              <Outlet context={{ refreshContest }} />
            </ExamModeWrapper>
          </div>
        </div>
      </Theme>

      <Modal
        open={isExitModalOpen}
        modalHeading="確認離開競賽"
        primaryButtonText="確認離開"
        secondaryButtonText="取消"
        onRequestClose={() => setIsExitModalOpen(false)}
        onRequestSubmit={handleExit}
        danger
      >
        <p>
          {(() => {
            // Teacher/Admin
            if (contest?.current_user_role === 'teacher' || contest?.current_user_role === 'admin') {
              return '確定要離開競賽管理頁面嗎？';
            }

            // Student - Not joined
            if (!contest?.has_joined && !contest?.is_registered) {
              return '確定要離開競賽頁面嗎？';
            }

            // Student - Joined but exam not started (or finished)
            if (!contest?.status || contest.status === 'inactive' || contest.has_finished_exam) {
              return '確定要離開競賽頁面嗎？';
            }

            // Student - Exam in progress
            return (
              <span>
                警告：競賽正在進行中。
                <br />
                {contest?.allow_multiple_joins ? (
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
