import { useState, useEffect } from 'react';
import { Outlet, useParams, useNavigate } from 'react-router-dom';
import {
  Header,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  Modal
} from '@carbon/react';
import { Logout, Time } from '@carbon/icons-react';
import { api } from '../services/api';
import type { Contest } from '../services/api';

const ContestLayout = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const [contest, setContest] = useState<Contest | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('00:00:00');
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);

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

  const handleExit = async () => {
    if (contestId) {
      try {
        await api.leaveContest(contestId);
        navigate('/contests');
      } catch (error) {
        console.error('Failed to leave contest', error);
      }
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header aria-label="Contest Platform">
        <HeaderName prefix="NYCU" href="#">
          [競賽模式] {contest?.title}
        </HeaderName>
        <HeaderGlobalBar>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            color: 'white', 
            marginRight: '2rem',
            fontFamily: 'monospace',
            fontSize: '1.2rem',
            fontWeight: 'bold'
          }}>
            <Time style={{ marginRight: '0.5rem' }} />
            {timeLeft}
          </div>
          <HeaderGlobalAction 
            aria-label="Exit Contest" 
            onClick={() => setIsExitModalOpen(true)}
            tooltipAlignment="end"
          >
            <Logout size={20} />
          </HeaderGlobalAction>
        </HeaderGlobalBar>
      </Header>

      <div style={{ marginTop: '3rem', flex: 1, overflow: 'auto', backgroundColor: 'var(--cds-layer-01)' }}>
        <Outlet />
      </div>

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
          {contest?.allow_multiple_joins ? (
            <span>您確定要離開競賽嗎？<br />您可以隨時重新進入繼續作答。</span>
          ) : (
            <span>
              警告：離開競賽後將<strong>無法重新進入</strong>。
              <br />
              確定要現在結束考試嗎？
            </span>
          )}
        </p>
      </Modal>
    </div>
  );
};

export default ContestLayout;
