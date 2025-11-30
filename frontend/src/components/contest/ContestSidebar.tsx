import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Tag, 
  ClickableTile,
  Button
} from '@carbon/react';
import { Time, ArrowLeft, Checkmark } from '@carbon/icons-react';
import type { ContestDetail } from '@/models/contest';

interface ContestSidebarProps {
  contest: ContestDetail;
  currentProblemId?: string | number;
}

const ContestSidebar: React.FC<ContestSidebarProps> = ({ contest, currentProblemId }) => {
  const navigate = useNavigate();
  const [timeLeft, setTimeLeft] = useState<string>('00:00:00');

  useEffect(() => {
    if (!contest) return;

    const timer = setInterval(() => {
      const end = new Date(contest.end_time).getTime();
      const now = new Date().getTime();
      const diff = end - now;

      if (diff <= 0) {
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

  // Get user's submission status for each problem
  // TODO: Implement actual status check from backend
  // const getUserProblemStatus = (problemId: number) => {
  //   return false;
  // };


  return (
    <div style={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      gap: '1rem'
    }}>
      {/* Back to Dashboard Button */}
      <div>
        <Button
          kind="ghost"
          renderIcon={ArrowLeft}
          onClick={() => {
            const searchParams = new URLSearchParams(window.location.search);
            navigate({
              pathname: `/contests/${contest.id}`,
              search: searchParams.toString()
            });
          }}
          style={{ width: '100%' }}
        >
          返回題目列表
        </Button>
      </div>

      {/* Countdown Timer */}
      <div style={{
        padding: '1.5rem',
        backgroundColor: 'var(--cds-ui-background)',
        border: '1px solid var(--cds-border-subtle-01)',
        borderRadius: '4px'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          marginBottom: '0.5rem',
          color: 'var(--cds-text-secondary)',
          fontSize: '0.875rem'
        }}>
          <Time style={{ marginRight: '0.5rem' }} size={16} />
          剩餘時間
        </div>
        <div style={{
          fontSize: '2rem',
          fontFamily: 'monospace',
          fontWeight: 'bold',
          color: timeLeft === '00:00:00' ? 'var(--cds-support-error)' : 'var(--cds-text-primary)',
          textAlign: 'center'
        }}>
          {timeLeft}
        </div>
        <div style={{
          fontSize: '0.75rem',
          color: 'var(--cds-text-secondary)',
          textAlign: 'center',
          marginTop: '0.5rem'
        }}>
          {contest.problems?.length || 0} 題
        </div>
      </div>

      {/* Personal Progress & Score */}
      <div style={{
        padding: '1.5rem',
        backgroundColor: 'var(--cds-ui-background)',
        border: '1px solid var(--cds-border-subtle-01)',
        borderRadius: '4px'
      }}>
        <div style={{ 
          fontSize: '0.875rem',
          color: 'var(--cds-text-secondary)',
          marginBottom: '1rem'
        }}>
          個人進度
        </div>
        
        {/* Progress Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1rem',
          marginBottom: '1rem'
        }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginBottom: '0.25rem' }}>
              已完成
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', fontFamily: 'monospace' }}>
              0/{contest.problems?.length || 0}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginBottom: '0.25rem' }}>
              總分
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', fontFamily: 'monospace' }}>
              0
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            fontSize: '0.75rem',
            color: 'var(--cds-text-secondary)',
            marginBottom: '0.5rem'
          }}>
            <span>完成率</span>
            <span>0%</span>
          </div>
          <div style={{
            height: '8px',
            backgroundColor: 'var(--cds-layer-02)',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: '0%',
              backgroundColor: 'var(--cds-support-success)',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
      </div>

      {/* Problems List */}
      <div style={{
        flex: 1,
        backgroundColor: 'var(--cds-ui-background)',
        border: '1px solid var(--cds-border-subtle-01)',
        borderRadius: '4px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ 
          padding: '1rem',
          borderBottom: '1px solid var(--cds-border-subtle-01)',
          fontWeight: 'bold'
        }}>
          題目列表
        </div>
        <div style={{ 
          flex: 1,
          overflowY: 'auto',
          padding: '0.5rem'
        }}>
          {contest.problems && contest.problems.length > 0 ? (
            contest.problems.map((problem: any) => {
              const isCurrentProblem = currentProblemId && 
                (problem.problem_id.toString() === currentProblemId.toString());
              const isCompleted = false; // TODO: Get actual status from backend
              
              return (
                <ClickableTile
                  key={problem.problem_id}
                  onClick={() => {
                    const searchParams = new URLSearchParams(window.location.search);
                    navigate({
                      pathname: `/contests/${contest.id}/problems/${problem.problem_id}`,
                      search: searchParams.toString()
                    });
                  }}
                  style={{
                    marginBottom: '0.5rem',
                    padding: '0.75rem',
                    backgroundColor: isCurrentProblem ? 'var(--cds-layer-accent-01)' : 'var(--cds-layer-01)',
                    border: isCurrentProblem ? '2px solid var(--cds-border-interactive)' : '1px solid var(--cds-border-subtle-01)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        fontWeight: isCurrentProblem ? 'bold' : 'normal',
                        fontSize: '0.875rem',
                        marginBottom: '0.25rem'
                      }}>
                        {problem.title}
                      </div>
                      <div style={{ 
                        fontSize: '0.75rem', 
                        color: 'var(--cds-text-secondary)',
                        display: 'flex',
                        gap: '0.5rem',
                        alignItems: 'center'
                      }}>
                        <Tag size="sm" type={
                          problem.difficulty === 'easy' ? 'green' :
                          problem.difficulty === 'medium' ? 'cyan' : 'red'
                        }>
                          {problem.difficulty}
                        </Tag>
                        <span>{problem.score} 分</span>
                      </div>
                    </div>
                    {isCompleted && (
                      <Checkmark size={20} style={{ color: 'var(--cds-support-success)', marginLeft: '0.5rem' }} />
                    )}
                  </div>
                </ClickableTile>
              );
            })
          ) : (
            <div style={{ 
              padding: '1rem', 
              textAlign: 'center', 
              color: 'var(--cds-text-secondary)' 
            }}>
              暫無題目
            </div>
          )}
        </div>
      </div>

      {/* Announcements */}
      <div style={{
        backgroundColor: 'var(--cds-ui-background)',
        border: '1px solid var(--cds-border-subtle-01)',
        borderRadius: '4px',
        maxHeight: '200px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ 
          padding: '1rem',
          borderBottom: '1px solid var(--cds-border-subtle-01)',
          fontWeight: 'bold'
        }}>
          最新公告
        </div>
        <div style={{ 
          flex: 1,
          overflowY: 'auto',
          padding: '1rem'
        }}>
          {contest.description ? (
            <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
              {contest.description.substring(0, 100)}
              {contest.description.length > 100 && '...'}
            </div>
          ) : (
            <div style={{ 
              fontSize: '0.875rem', 
              color: 'var(--cds-text-secondary)',
              fontStyle: 'italic'
            }}>
              暫無公告
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContestSidebar;
