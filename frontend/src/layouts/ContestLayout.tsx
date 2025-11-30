import { useState, useEffect } from 'react';
import { Outlet, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Header,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  HeaderNavigation,
  HeaderMenuItem,
  Modal,
  Toggle,
  Theme,
  Button
} from '@carbon/react';
import { Logout, Time, Stop } from '@carbon/icons-react';
import { useTheme } from '@/contexts/ThemeContext';
import { Light, Asleep } from '@carbon/icons-react';
import { createExamHandlers } from '@/components/contest/ExamModeWrapper';
import { api } from '@/services/api';
import type { ContestDetail } from '@/models/contest';

const ContestLayout = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('00:00:00');
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const { theme, toggleTheme } = useTheme();

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

  const handleExit = async () => {
    if (!contestId || !contest) return;

    try {
      // If exam mode is enabled and exam is active, end the exam first
      if (contest.exam_mode_enabled && contest.status === 'active' && !contest.has_finished_exam) {
        const { endExam } = createExamHandlers(contest.id, contest.exam_mode_enabled, refreshContest);
        await endExam();
      }
      
      // Then leave the contest
      await api.leaveContest(contestId);
      navigate('/contests');
    } catch (error) {
      console.error('Failed to leave contest', error);
      alert('無法離開競賽，請稍後再試');
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Theme theme={theme}>
        <Header aria-label="Contest Platform">
          <HeaderName prefix="NYCU" href="#">
            [競賽模式] {contest?.name}
          </HeaderName>
          <HeaderNavigation aria-label="Contest Navigation">
            <HeaderMenuItem onClick={() => navigate(`/contests/${contestId}`)}>
              題目列表
            </HeaderMenuItem>
            <HeaderMenuItem onClick={() => navigate(`/contests/${contestId}/submissions`)}>
              提交記錄
            </HeaderMenuItem>
            <HeaderMenuItem onClick={() => navigate(`/contests/${contestId}/standings`)}>
              排行榜
            </HeaderMenuItem>
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

            {(contest?.current_user_role === 'teacher' || contest?.current_user_role === 'admin' || currentUser?.role === 'teacher' || currentUser?.role === 'admin') && (
              <div style={{ display: 'flex', alignItems: 'center', marginRight: '1rem' }}>
                <Toggle
                  id="view-mode-toggle"
                  labelA="學生視角"
                  labelB="管理模式"
                  toggled={searchParams.get('view') !== 'student'}
                  onToggle={(checked: boolean) => {
                    const newView = checked ? 'teacher' : 'student';
                    navigate(`/contests/${contestId}?view=${newView}`);
                  }}
                  size="sm"
                />
              </div>
            )}
            <HeaderGlobalAction 
              aria-label="Exit Contest" 
              onClick={() => setIsExitModalOpen(true)}
              tooltipAlignment="end"
            >
              <Logout size={20} />
            </HeaderGlobalAction>
          </HeaderGlobalBar>
        </Header>
      </Theme>

      <Theme theme={theme} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ marginTop: '3rem', flex: 1, overflow: 'auto', backgroundColor: 'var(--cds-layer-01)' }}>
          <Outlet context={{ refreshContest }} />
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
