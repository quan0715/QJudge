import { useEffect, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import type { ExamModeState, ExamStatusType } from '@/core/entities/contest.entity';
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
  examStatus?: ExamStatusType;
  currentUserRole?: UserRole;
  onExamStart?: () => void;
  onExamEnd?: () => void;
  onRefresh?: () => Promise<void>;
  children: ReactNode;
}

const ExamModeWrapper: React.FC<ExamModeWrapperProps> = ({
  contestId,
  examModeEnabled,
  isActive,
  isLocked,
  lockReason,
  examStatus,
  currentUserRole,
  onRefresh,
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
  const isGracePeriod = useRef(false);
  const isSubmitting = useRef(false);
  const prevIsActiveRef = useRef(false);
  
  // Blocking modal flow states
  const [isProcessingEvent, setIsProcessingEvent] = useState(false);
  const [pendingApiResponse, setPendingApiResponse] = useState(false);
  const [lastApiResponse, setLastApiResponse] = useState<any>(null);
  
  // Unlock notification state
  const [showUnlockNotification, setShowUnlockNotification] = useState(false);
  const prevExamStatusRef = useRef(examStatus);
  
  // Grace period countdown (in seconds)
  const [gracePeriodCountdown, setGracePeriodCountdown] = useState(0);
  const GRACE_PERIOD_SECONDS = 3;

  // Admin/Teacher bypass
  const isBypassed = currentUserRole === 'admin' || currentUserRole === 'teacher';

  useEffect(() => {
    // Use examStatus as primary source if available
    const effectiveIsLocked = examStatus === 'locked' || !!isLocked;
    const effectiveIsActive = examStatus === 'in_progress' || (isActive && examStatus !== 'paused' && examStatus !== 'submitted');
    
    setExamState(prev => ({ 
      ...prev, 
      isActive: effectiveIsActive,
      isLocked: effectiveIsLocked,
      lockReason: lockReason || prev.lockReason
    }));

    // Detect unlock transition: locked -> paused
    if (prevExamStatusRef.current === 'locked' && examStatus === 'paused') {
      setShowUnlockNotification(true);
    }
    
    // Exit fullscreen when exam is submitted
    if (examStatus === 'submitted' && prevExamStatusRef.current !== 'submitted') {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(e => {
          console.warn('Failed to exit fullscreen on submit:', e);
        });
      }
    }
    
    prevExamStatusRef.current = examStatus;

    // Start grace period when exam becomes active
    if (effectiveIsActive && !prevIsActiveRef.current) {
      // Reset processing state for fresh start (important after unlock!)
      setIsProcessingEvent(false);
      
      isGracePeriod.current = true;
      setGracePeriodCountdown(GRACE_PERIOD_SECONDS);
      
      // Countdown timer
      const countdownInterval = setInterval(() => {
        setGracePeriodCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            isGracePeriod.current = false;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      // Auto enter fullscreen (mandatory when monitoring is active)
      if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(e => {
              console.warn('Failed to enter fullscreen automatically:', e);
          });
      }
    }
    prevIsActiveRef.current = effectiveIsActive;
  }, [isActive, isLocked, lockReason, examStatus]);

  // Track last interaction time to debounce blur events during submit
  const lastInteractionTime = useRef<number>(0);
  
  // Update interaction time on any user click (helps detect submit button clicks)
  useEffect(() => {
    const handleClick = () => {
      lastInteractionTime.current = Date.now();
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);

  // prevIsActiveRef moved to top with other refs

  useEffect(() => {
    // Use examStatus prop directly to avoid React state batching delays
    const isCurrentlyActive = examStatus === 'in_progress';
    const isCurrentlyLocked = examStatus === 'locked';
    
    if (!examModeEnabled || !isCurrentlyActive || isBypassed) return;

    // Blocking modal flow: detect -> pause -> show modal -> API -> wait -> close
    const handleCheatEvent = async (eventType: string, reason: string) => {
      // Skip if already processing, locked, in grace period, or submitting
      // Use isCurrentlyLocked from closure instead of examState.isLocked
      if (isProcessingEvent || isCurrentlyLocked || isGracePeriod.current || isSubmitting.current) return;
      
      // 1. Immediately pause detection
      setIsProcessingEvent(true);
      
      // 2. Show blocking modal and mark API as pending
      setPendingApiResponse(true);
      setWarningEventType(eventType);
      setShowWarning(true);
      
      // 3. Send API request
      try {
        const response = await recordExamEvent(contestId, eventType, reason);
        
        // 4. Store response for modal close handler
        setLastApiResponse(response);
        
        // Update violation count in state
        if (response && typeof response === 'object') {
          const { violation_count, max_cheat_warnings, auto_unlock_at, bypass } = response;
          if (!bypass) {
            setExamState(prev => ({
              ...prev,
              violationCount: violation_count,
              maxWarnings: max_cheat_warnings,
              autoUnlockAt: auto_unlock_at
            }));
          }
        }
      } catch (error) {
        console.error('Failed to record event:', error);
        setLastApiResponse({ error: true });
      }
      
      // 5. Allow modal close
      setPendingApiResponse(false);
    };

    // Event handlers
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        await handleCheatEvent('tab_hidden', '您已切換分頁');
      }
    };

    const handleBlur = async () => {
      // Skip blur events that happen within 100ms of a click (likely from submit button)
      const timeSinceClick = Date.now() - lastInteractionTime.current;
      if (timeSinceClick < 100) return;
      await handleCheatEvent('window_blur', '您已離開視窗');
    };

    const handleFullscreenChange = async () => {
      if (!document.fullscreenElement) {
        await handleCheatEvent('exit_fullscreen', '您已退出全螢幕');
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
  }, [examModeEnabled, examStatus, isProcessingEvent, contestId, location.pathname, isBypassed]);

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
        clearInterval(timer);
        // Optional: Auto-refresh or unlock
        if (onRefresh) onRefresh();
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
    // Block close if API response is still pending
    if (pendingApiResponse) return;
    
    setShowWarning(false);
    
    // Check if locked based on API response
    if (lastApiResponse?.locked) {
      // Exit fullscreen
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch (e) {
          console.error('Failed to exit fullscreen:', e);
        }
      }
      // Reload page to show lock screen properly regardless of current path
      if (onRefresh) onRefresh();
    } else {
      // Resume monitoring - force fullscreen (mandatory)
      setIsProcessingEvent(false);
      if (!document.fullscreenElement) {
        try {
          await document.documentElement.requestFullscreen();
          console.log('[Anti-cheat] Re-entering fullscreen after warning');
        } catch (error) {
          console.error('[Anti-cheat] Failed to re-enter fullscreen:', error);
        }
      }
    }
    
    // Reset states
    setWarningEventType(null);
    setLastApiResponse(null);
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
    if (onRefresh) onRefresh();
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', flex: 1 }}>
      {children}

      {/* Grace Period Countdown Overlay */}
      {gracePeriodCountdown > 0 && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            zIndex: 9998,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '1rem',
            color: 'white',
            animation: 'fadeIn 0.3s ease-in-out'
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#42be65' }}>
              ✅ 考試模式已啟用
            </div>
            <div style={{ fontSize: '1.2rem', color: '#ccc', marginBottom: '2rem' }}>
              防作弊監控將在倒數結束後開始運作
            </div>
            <div 
              style={{ 
                fontSize: '5rem', 
                fontWeight: 'bold', 
                fontFamily: 'monospace',
                color: '#f1c21b',
                textShadow: '0 0 20px rgba(241, 194, 27, 0.5)'
              }}
            >
              {gracePeriodCountdown}
            </div>
            <div style={{ fontSize: '1rem', color: '#888', marginTop: '2rem' }}>
              請勿切換分頁或離開視窗
            </div>
          </div>
        </div>
      )}

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

      {/* Warning Modal - blocks until API responds */}
      <Modal
        open={showWarning}
        modalHeading="⚠️ 違規警告"
        primaryButtonText={pendingApiResponse ? "處理中..." : (lastApiResponse?.locked ? "確認" : "我了解了")}
        primaryButtonDisabled={pendingApiResponse}
        onRequestSubmit={() => handleWarningClose()}
        onRequestClose={() => handleWarningClose()}
        preventCloseOnClickOutside
        danger
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <WarningAlt size={64} style={{ color: pendingApiResponse ? '#888' : '#f1c21b', marginBottom: '1rem' }} />
          <p style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            {pendingApiResponse ? '正在記錄違規行為...' : '檢測到異常操作'}
          </p>
          <p style={{ marginBottom: '1rem', color: 'var(--cds-text-secondary)' }}>
            {warningEventType === 'tab_hidden' && '您切換了分頁'}
            {warningEventType === 'window_blur' && '您離開了視窗'}
            {warningEventType === 'exit_fullscreen' && '您退出了全螢幕'}
          </p>
          <p style={{ marginBottom: '1rem' }}>
            請保持在考試頁面並維持全螢幕模式。
          </p>
          
          {!pendingApiResponse && examState.violationCount !== undefined && examState.maxWarnings !== undefined && (
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
                <span style={{ fontWeight: 'bold', color: lastApiResponse?.locked ? '#da1e28' : '#42be65' }}>
                  {lastApiResponse?.locked ? '0 - 已鎖定' : Math.max(0, (examState.maxWarnings + 1) - examState.violationCount)}
                </span>
              </div>
            </div>
          )}
          
          {lastApiResponse?.locked ? (
            <p style={{ marginTop: '1rem', color: '#da1e28', fontSize: '0.875rem', fontWeight: 'bold' }}>
              您的考試已被鎖定！請聯繫監考老師。
            </p>
          ) : (
            <p style={{ marginTop: '1rem', color: '#da1e28', fontSize: '0.875rem' }}>
              若剩餘機會歸零，您將被自動鎖定！
            </p>
          )}
        </div>
      </Modal>

      {/* Unlock Notification Modal */}
      <Modal
        open={showUnlockNotification}
        modalHeading="🔓 已解鎖"
        primaryButtonText="繼續考試"
        onRequestSubmit={() => setShowUnlockNotification(false)}
        onRequestClose={() => setShowUnlockNotification(false)}
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <p style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#42be65' }}>
            您的考試已被解鎖！
          </p>
          <p style={{ marginBottom: '1rem' }}>
            監考老師已解除您的鎖定狀態。點擊「繼續考試」重新進入考試模式。
          </p>
          <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
            提醒：請遵守考試規則，避免再次被鎖定。
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
