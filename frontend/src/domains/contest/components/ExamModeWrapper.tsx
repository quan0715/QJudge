import { useEffect, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import type { ExamModeState } from '@/core/entities/contest.entity';
import type { UserRole } from '@/core/entities/user.entity';
import { endExam as serviceEndExam, recordExamEvent } from '@/services/contest';
import { useNavigate, useLocation } from 'react-router-dom';
import { Modal, Button } from '@carbon/react';
import { WarningAlt } from '@carbon/icons-react';

interface ExamModeWrapperProps {
  contestId: string;
  examModeEnabled: boolean;
  isActive: boolean;
  isLocked?: boolean;
  lockReason?: string;
  currentUserRole?: UserRole;
  onExamStart?: () => void;
  onExamEnd?: () => void;
  children: ReactNode;
}

const ExamModeWrapper: React.FC<ExamModeWrapperProps> = ({
  contestId,
  examModeEnabled,
  isActive,
  isLocked,
  lockReason,
  currentUserRole,
  children
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [examState, setExamState] = useState<ExamModeState>({
    isActive: false,
    isLocked: false,
    violationCount: 0,
    maxWarnings: 0
  });
  const [showWarning, setShowWarning] = useState(false);
  const [warningEventType, setWarningEventType] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isRecordingEvent = useRef(false);
  const isGracePeriod = useRef(false);
  
  // Event deduplication and cooldown
  const lastEventType = useRef<string | null>(null);
  const lastEventTime = useRef<number>(0);
  const COOLDOWN_PERIOD = 2000; // 2 seconds global cooldown
  
  // Event priority (higher number = higher priority)
  const EVENT_PRIORITY: Record<string, number> = {
    'exit_fullscreen': 3,
    'tab_hidden': 2,
    'window_blur': 1
  };

  // Admin/Teacher bypass
  const isBypassed = currentUserRole === 'admin' || currentUserRole === 'teacher';

  useEffect(() => {
    setExamState(prev => ({ 
      ...prev, 
      isActive,
      isLocked: !!isLocked,
      lockReason: lockReason || prev.lockReason
    }));

    // Start grace period when exam becomes active
    if (isActive && !prevIsActiveRef.current) {
      isGracePeriod.current = true;
      setTimeout(() => {
        isGracePeriod.current = false;
      }, 3000); // 3 seconds grace period
    }
    prevIsActiveRef.current = isActive;
  }, [isActive, isLocked, lockReason]);

  const prevIsActiveRef = useRef(isActive);

  useEffect(() => {
    // Disable anti-cheat on dashboard check removed to ensure global protection
    if (!examModeEnabled || !examState.isActive || isBypassed) return;

    // Shared event handler with deduplication and cooldown
    const handleCheatEvent = async (eventType: string, reason: string) => {
      if (examState.isLocked || isGracePeriod.current || isRecordingEvent.current) return;
      
      const now = Date.now();
      const timeSinceLastEvent = now - lastEventTime.current;
      
      // Global cooldown check
      if (timeSinceLastEvent < COOLDOWN_PERIOD) {
        // Within cooldown period - check priority
        const currentPriority = EVENT_PRIORITY[eventType] || 0;
        const lastPriority = EVENT_PRIORITY[lastEventType.current || ''] || 0;
        
        // Only record if current event has higher priority
        if (currentPriority <= lastPriority) {
          console.log(`[Anti-cheat] Ignoring ${eventType} due to cooldown (last: ${lastEventType.current})`);
          return;
        }
        console.log(`[Anti-cheat] Override: ${eventType} (priority ${currentPriority}) > ${lastEventType.current} (priority ${lastPriority})`);
      }
      
      // Record the event
      isRecordingEvent.current = true;
      lastEventType.current = eventType;
      lastEventTime.current = now;
      
      await recordEvent(eventType, reason);
      
      isRecordingEvent.current = false;
    };

    // Event handlers
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        await handleCheatEvent('tab_hidden', '您已切換分頁，本次作答已被鎖定');
      }
    };

    const handleBlur = async () => {
      await handleCheatEvent('window_blur', '您已離開視窗，本次作答已被鎖定');
    };

    const handleFullscreenChange = async () => {
      if (!document.fullscreenElement) {
        await handleCheatEvent('exit_fullscreen', '您已退出全螢幕，本次作答已被鎖定');
      }
    };

    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [examModeEnabled, examState.isActive, contestId, location.pathname]);

  const recordEvent = async (type: string, reason: string) => {
    try {
      const res = await recordExamEvent(contestId, type, reason);
      
      if (res && typeof res === 'object') {
        const { locked, violation_count, max_warnings, bypass, auto_unlock_at } = res;
        
        if (bypass) return;

        setExamState(prev => ({
          ...prev,
          violationCount: violation_count,
          maxWarnings: max_warnings,
          autoUnlockAt: auto_unlock_at
        }));

        if (locked) {
          lockExam(reason);
        } else if (violation_count > 0) {
          // Show warning if not locked but violation recorded
          setWarningEventType(type);
          setShowWarning(true);
        }
      }
    } catch (error) {
      console.error('Failed to record event:', error);
    }
  };

  const lockExam = (reason: string) => {
    setExamState(prev => ({
      ...prev,
      isLocked: true,
      lockReason: reason
    }));
  };

  const isAllowedPath = () => {
    // Allow dashboard, standings, and submissions
    const path = location.pathname;
    // Check if path ends with contestId (dashboard) or specific allowed sub-paths
    // We need to be careful with trailing slashes
    const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path;
    const contestBase = `/contests/${contestId}`;
    
    return normalizedPath === contestBase || 
           normalizedPath === `${contestBase}/standings` || 
           normalizedPath === `${contestBase}/submissions` ||
           normalizedPath === `${contestBase}/clarifications`;
  };

  const shouldShowLockScreen = examState.isLocked && !isAllowedPath();

  // Auto-unlock countdown logic
  const [timeLeft, setTimeLeft] = useState<string | null>(null);

  useEffect(() => {
    if (!shouldShowLockScreen || !examState.autoUnlockAt) {
      setTimeLeft(null);
      return;
    }

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const unlockTime = new Date(examState.autoUnlockAt!).getTime();
      const diff = unlockTime - now;

      if (diff <= 0) {
        setTimeLeft('00:00:00');
        clearInterval(timer);
        // Optional: Auto-refresh or unlock
        window.location.reload();
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
  }, [shouldShowLockScreen, examState.autoUnlockAt]);

  const handleWarningClose = async () => {
    setShowWarning(false);
    
    // If the warning was due to exiting fullscreen, re-enter fullscreen
    if (warningEventType === 'exit_fullscreen' && !examState.isLocked) {
      try {
        await document.body.requestFullscreen();
        console.log('[Anti-cheat] Re-entering fullscreen after warning');
      } catch (error) {
        console.error('[Anti-cheat] Failed to re-enter fullscreen:', error);
      }
    }
    
    // Reset warning event type
    setWarningEventType(null);
  };

  const handleBackToContest = async () => {
    // Exit fullscreen if active
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (e) {
        console.error('Failed to exit fullscreen', e);
      }
    }
    // Navigate to dashboard and refresh to ensure clean state
    navigate(`/contests/${contestId}`);
    window.location.reload();
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', flex: 1 }}>
      {children}

      {/* Lock Overlay */}
      {shouldShowLockScreen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            flexDirection: 'column',
            gap: '2rem'
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: '600px', padding: '2rem' }}>
            <h1 style={{ fontSize: '3rem', marginBottom: '1rem', color: '#ff4444' }}>
              ⚠️ 作答已鎖定
            </h1>
            <p style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
              {examState.lockReason}
            </p>
            
            {timeLeft ? (
              <div style={{ margin: '2rem 0', padding: '1.5rem', border: '1px solid #555', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.1)' }}>
                <p style={{ fontSize: '1rem', color: '#ccc', marginBottom: '0.5rem' }}>自動解鎖倒數</p>
                <div style={{ fontSize: '2.5rem', fontFamily: 'monospace', fontWeight: 'bold', color: '#42be65' }}>
                  {timeLeft}
                </div>
              </div>
            ) : (
              <p style={{ fontSize: '1.2rem', color: '#ccc' }}>
                請聯繫監考老師解除鎖定。
              </p>
            )}

            <p style={{ fontSize: '1rem', marginTop: '2rem', color: '#999' }}>
              此違規行為已被記錄。
            </p>
            
            <div style={{ marginTop: '3rem' }}>
              <Button 
                kind="tertiary" 
                onClick={handleBackToContest}
              >
                回到競賽儀表板
              </Button>
              <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#888' }}>
                (您可以查看排行榜或提交記錄，但無法繼續作答)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Warning Modal */}
      <Modal
        open={showWarning}
        modalHeading="⚠️ 違規警告"
        primaryButtonText="我了解了"
        onRequestSubmit={() => handleWarningClose()}
        onRequestClose={() => handleWarningClose()}
        danger
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <WarningAlt size={64} style={{ color: '#f1c21b', marginBottom: '1rem' }} />
          <p style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            檢測到異常操作
          </p>
          <p style={{ marginBottom: '1rem' }}>
            請保持在考試頁面並維持全螢幕模式。
          </p>
          
          {examState.violationCount !== undefined && examState.maxWarnings !== undefined && (
            <div style={{ 
              width: '100%', 
              backgroundColor: 'var(--cds-layer-01)', 
              padding: '1rem', 
              borderRadius: '4px',
              marginTop: '1rem' 
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span>累積違規次數:</span>
                <span style={{ fontWeight: 'bold', color: '#da1e28' }}>{examState.violationCount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>剩餘機會:</span>
                <span style={{ fontWeight: 'bold', color: '#42be65' }}>
                  {Math.max(0, (examState.maxWarnings + 1) - examState.violationCount)}
                </span>
              </div>
            </div>
          )}
          
          <p style={{ marginTop: '1rem', color: '#da1e28', fontSize: '0.875rem' }}>
            若剩餘機會歸零，您將被自動鎖定！
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default ExamModeWrapper;

// Export helper functions for parent components
export const createExamHandlers = (
  contestId: string,
  examModeEnabled: boolean,
  onSuccess?: () => void,
  userId?: string, // Add userId parameter here
  unlockParticipant?: (contestId: string, userId: string) => Promise<void> // Add unlockParticipant parameter here
) => {
  const startExam = async () => {
    try {
      // Check if unlockParticipant is provided and userId is available
      if (unlockParticipant && userId) {
        await unlockParticipant(contestId, userId);
      } else {
        // Fallback or error if unlockParticipant/userId not provided
        console.warn('unlockParticipant or userId not provided to createExamHandlers. Skipping unlock.');
        // Optionally, you might still want to call api.startExam if unlockParticipant is not the primary action
        // await api.startExam(contestId); 
      }
      
      if (examModeEnabled && document.body) {
        try {
          await document.body.requestFullscreen();
        } catch (error) {
          console.error('Failed to enter fullscreen:', error);
        }
      }
      
      onSuccess?.();
      return true;
    } catch (error) {
      console.error('Failed to start exam:', error);
      return false;
    }
  };

  const endExam = async () => {
    try {
      await serviceEndExam(contestId);
      
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch (error) {
          console.error('Failed to exit fullscreen:', error);
        }
      }
      
      onSuccess?.();
      return true;
    } catch (error) {
      console.error('Failed to end exam:', error);
      return false;
    }
  };

  return { startExam, endExam };
};
