import { Tile, Tag, ProgressBar } from '@carbon/react';
import { Time } from '@carbon/icons-react';
import type { ContestDetail } from '@/types/contest';
import { useState, useEffect } from 'react';

interface ContestHeaderProps {
  contest: ContestDetail;
}

const ContestHeader: React.FC<ContestHeaderProps> = ({ contest }) => {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date().getTime();
      const start = new Date(contest.start_time).getTime();
      const end = new Date(contest.end_time).getTime();
      
      if (now < start) {
        setTimeLeft('尚未開始');
        setProgress(0);
      } else if (now > end) {
        setTimeLeft('已結束');
        setProgress(100);
      } else {
        const total = end - start;
        const elapsed = now - start;
        const remaining = end - now;
        
        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
        
        setTimeLeft(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        setProgress((elapsed / total) * 100);
      }
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, [contest.start_time, contest.end_time]);

  const getStatusTag = () => {
    if (contest.status === 'active') {
      return <Tag type="green">進行中</Tag>;
    }
    return <Tag type="gray">未開始</Tag>;
  };

  const isTeacherOrAdmin = contest.current_user_role === 'teacher' || contest.current_user_role === 'admin';

  return (
    <Tile style={{ marginBottom: '2rem', padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>{contest.title || contest.name}</h1>
            {getStatusTag()}
          </div>
          <div style={{ display: 'flex', gap: '1rem', color: 'var(--cds-text-secondary)', marginBottom: '0.5rem' }}>
            <span>
              <Time /> {new Date(contest.start_time).toLocaleString()} ~ {new Date(contest.end_time).toLocaleString()}
            </span>
          </div>
          {contest.description && (
            <p style={{ color: 'var(--cds-text-secondary)', marginTop: '0.5rem' }}>
              {contest.description}
            </p>
          )}
          {isTeacherOrAdmin && (
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
              <Tag type="blue">角色: {contest.current_user_role}</Tag>
              {contest.exam_mode_enabled && <Tag type="purple">考試模式</Tag>}
              {contest.visibility === 'private' && <Tag type="magenta">私人競賽</Tag>}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginBottom: '0.25rem' }}>
            剩餘時間
          </div>
          <div 
            style={{ 
              fontSize: '2.5rem', 
              fontWeight: 'bold', 
              fontFamily: 'monospace', 
              color: timeLeft === '已結束' ? 'red' : 'var(--cds-text-primary)' 
            }}
          >
            {timeLeft}
          </div>
        </div>
      </div>
      <ProgressBar value={progress} max={100} label="競賽進度" />
    </Tile>
  );
};

export default ContestHeader;
