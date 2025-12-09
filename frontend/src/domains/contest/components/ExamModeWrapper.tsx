import { useEffect, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import type { ExamModeState, ExamStatusType } from '@/core/entities/contest.entity';
import type { UserRole } from '@/core/entities/user.entity';
import { endExam as serviceEndExam, recordExamEvent } from '@/services/contest';
import { useNavigate, useLocation } from 'react-router-dom';
import { Modal, Button } from '@carbon/react';
import { WarningAlt, Locked, CheckmarkFilled } from '@carbon/icons-react';

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

  // Fullscreen exit confirmation modal state (for locked/paused/in_progress)
  const [showFullscreenExitConfirm, setShowFullscreenExitConfirm] = useState(false);
  const [isSubmittingFromFullscreenExit, setIsSubmittingFromFullscreenExit] = useState(false);
  const initialFullscreenCheckDone = useRef(false);

  // Admin/Teacher bypass
  const isBypassed = currentUserRole === 'admin' || currentUserRole === 'teacher';

  // Initial check: if exam is active but not in fullscreen after page load, show confirmation
  useEffect(() => {
    // Only check once after initial render and exam status is known
    if (initialFullscreenCheckDone.current || !examModeEnabled || isBypassed) return;
    
    const shouldBeInFullscreen = examStatus === 'in_progress' || examStatus === 'locked' || examStatus === 'paused';
    
    if (shouldBeInFullscreen && !document.fullscreenElement) {
      // Give a small delay to allow user to manually enter fullscreen
      const timer = setTimeout(() => {
        if (!document.fullscreenElement && !isSubmittingFromFullscreenExit) {
          setShowFullscreenExitConfirm(true);
        }
        initialFullscreenCheckDone.current = true;
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      initialFullscreenCheckDone.current = true;
    }
  }, [examStatus, examModeEnabled, isBypassed, isSubmittingFromFullscreenExit]);

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
    
    // Exit fullscreen ONLY when exam is submitted (not for locked/paused)
    if (examStatus === 'submitted' && prevExamStatusRef.current !== 'submitted') {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(e => {
          console.warn('Failed to exit fullscreen on submit:', e);
        });
      }
    }
    
    // Stay in fullscreen when transitioning to locked or paused (do NOT exit)
    // Fullscreen is only allowed to exit after submission
    
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
  
  // Update interaction time on any user interaction (helps detect button clicks and form interactions)
  useEffect(() => {
    const handleInteraction = () => {
      lastInteractionTime.current = Date.now();
    };
    // Track multiple interaction types to catch all user actions
    document.addEventListener('mousedown', handleInteraction, true);
    document.addEventListener('pointerdown', handleInteraction, true);
    document.addEventListener('click', handleInteraction, true);
    return () => {
      document.removeEventListener('mousedown', handleInteraction, true);
      document.removeEventListener('pointerdown', handleInteraction, true);
      document.removeEventListener('click', handleInteraction, true);
    };
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
      // Skip blur events that happen within 500ms of any user interaction
      // This prevents false positives from Chrome extensions or internal browser processes
      const timeSinceInteraction = Date.now() - lastInteractionTime.current;
      if (timeSinceInteraction < 500) {
        console.log('[Anti-cheat] Ignoring blur event - recent user interaction detected');
        return;
      }
      
      // Additional check: verify document actually lost focus
      // Use setTimeout to check after the event loop, as focus state might not be updated yet
      setTimeout(() => {
        if (!document.hasFocus()) {
          handleCheatEvent('window_blur', '您已離開視窗');
        } else {
          console.log('[Anti-cheat] Ignoring blur event - document still has focus');
        }
      }, 50);
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

  // Monitor fullscreen exit for locked/paused states - treat as submit confirmation
  useEffect(() => {
    const shouldMonitorFullscreen = examModeEnabled && !isBypassed && 
      (examStatus === 'locked' || examStatus === 'paused');
    
    if (!shouldMonitorFullscreen) return;

    const handleFullscreenExitForLockedPaused = () => {
      if (!document.fullscreenElement && !isSubmittingFromFullscreenExit) {
        // User exited fullscreen while locked/paused - show confirmation
        setShowFullscreenExitConfirm(true);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenExitForLockedPaused);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenExitForLockedPaused);
    };
  }, [examModeEnabled, examStatus, isBypassed, isSubmittingFromFullscreenExit]);

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
      // Stay in fullscreen when locked - don't exit
      // Just refresh to show lock screen overlay
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

  // Handle fullscreen exit confirmation for locked/paused states
  const handleFullscreenExitConfirm = async () => {
    setIsSubmittingFromFullscreenExit(true);
    try {
      // Submit the exam
      await serviceEndExam(contestId);
      if (onRefresh) await onRefresh();
      setShowFullscreenExitConfirm(false);
      // Fullscreen exit is now allowed (exam is submitted)
    } catch (error) {
      console.error('Failed to submit exam:', error);
      // Still close the modal but try to re-enter fullscreen
      setShowFullscreenExitConfirm(false);
      try {
        await document.documentElement.requestFullscreen();
      } catch (e) {
        console.error('Failed to re-enter fullscreen:', e);
      }
    } finally {
      setIsSubmittingFromFullscreenExit(false);
    }
  };

  const handleFullscreenExitCancel = async () => {
    setShowFullscreenExitConfirm(false);
    // Re-enter fullscreen
    try {
      await document.documentElement.requestFullscreen();
    } catch (error) {
      console.error('Failed to re-enter fullscreen:', error);
    }
  };

  const handleBackToContest = async () => {
    // Do not exit fullscreen - stay in exam mode
    // Navigate to dashboard and refresh to ensure clean state
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
            backgroundColor: 'var(--cds-background-inverse, #161616)',
            zIndex: 9998,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '1.5rem',
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: '400px' }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '0.5rem',
              marginBottom: '1rem'
            }}>
              <CheckmarkFilled size={28} style={{ color: 'var(--cds-support-success, #42be65)' }} />
              <span style={{ 
                fontSize: '1.25rem', 
                fontWeight: 600, 
                color: 'var(--cds-text-on-color, #fff)'
              }}>
                考試模式已啟用
              </span>
            </div>
            <p style={{ 
              fontSize: '0.875rem', 
              color: 'var(--cds-text-on-color-disabled, #8d8d8d)', 
              marginBottom: '2rem',
              lineHeight: 1.5
            }}>
              防作弊監控將在倒數結束後開始運作
            </p>
            <div 
              style={{ 
                fontSize: '6rem', 
                fontWeight: 300, 
                fontFamily: "'IBM Plex Mono', monospace",
                color: 'var(--cds-text-on-color, #fff)',
                lineHeight: 1
              }}
            >
              {gracePeriodCountdown}
            </div>
            <p style={{ 
              fontSize: '0.75rem', 
              color: 'var(--cds-text-on-color-disabled, #8d8d8d)', 
              marginTop: '2rem',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}>
              請勿切換分頁或離開視窗
            </p>
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
            backgroundColor: 'var(--cds-background-inverse, #161616)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: '480px', padding: '2rem' }}>
            {/* Header */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '0.75rem',
              marginBottom: '1rem'
            }}>
              <Locked size={40} style={{ color: 'var(--cds-support-error, #fa4d56)' }} />
              <h1 style={{ 
                fontSize: '2rem', 
                fontWeight: 400, 
                margin: 0,
                color: 'var(--cds-support-error, #fa4d56)'
              }}>
                作答已鎖定
              </h1>
            </div>
            
            {/* Lock reason */}
            <p style={{ 
              fontSize: '1rem', 
              color: 'var(--cds-text-on-color-disabled, #8d8d8d)',
              marginBottom: '2rem',
              fontFamily: "'IBM Plex Mono', monospace"
            }}>
              {examState.lockReason}
            </p>
            
            {/* Countdown box */}
            {timeLeft ? (
              <div style={{ 
                margin: '2rem 0', 
                padding: '1.5rem 2rem', 
                backgroundColor: 'var(--cds-layer-02, #262626)',
                border: '1px solid var(--cds-border-subtle-01, #393939)'
              }}>
                <p style={{ 
                  fontSize: '0.75rem', 
                  color: 'var(--cds-text-on-color-disabled, #8d8d8d)', 
                  marginBottom: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '1px'
                }}>
                  自動解鎖倒數
                </p>
                <div style={{ 
                  fontSize: '2.5rem', 
                  fontFamily: "'IBM Plex Mono', monospace", 
                  fontWeight: 400, 
                  color: 'var(--cds-support-success, #42be65)',
                  letterSpacing: '2px'
                }}>
                  {timeLeft}
                </div>
              </div>
            ) : (
              <p style={{ 
                fontSize: '1rem', 
                color: 'var(--cds-text-on-color-disabled, #8d8d8d)',
                marginBottom: '2rem'
              }}>
                請聯繫監考老師解除鎖定。
              </p>
            )}

            <p style={{ 
              fontSize: '0.875rem', 
              color: 'var(--cds-text-on-color-disabled, #6f6f6f)',
              marginTop: '1.5rem',
              marginBottom: '2rem'
            }}>
              此違規行為已被記錄。
            </p>
            
            {/* Action */}
            <div style={{ marginTop: '1.5rem' }}>
              <Button 
                kind="ghost" 
                onClick={handleBackToContest}
                style={{ color: 'var(--cds-text-on-color, #fff)' }}
              >
                回到競賽儀表板
              </Button>
              <p style={{ 
                marginTop: '0.5rem', 
                fontSize: '0.75rem', 
                color: 'var(--cds-text-on-color-disabled, #6f6f6f)'
              }}>
                您可以查看排行榜或提交記錄，但無法繼續作答
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Warning Modal - blocks until API responds */}
      <Modal
        open={showWarning}
        modalHeading="違規警告"
        primaryButtonText={pendingApiResponse ? "處理中..." : (lastApiResponse?.locked ? "確認" : "我了解了")}
        primaryButtonDisabled={pendingApiResponse}
        onRequestSubmit={() => handleWarningClose()}
        onRequestClose={() => handleWarningClose()}
        preventCloseOnClickOutside
        danger
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          {/* Icon */}
          <div style={{ 
            padding: '1rem',
            backgroundColor: pendingApiResponse ? 'var(--cds-layer-02)' : 'var(--cds-notification-background-warning)',
            borderRadius: '50%',
            marginBottom: '1.5rem'
          }}>
            <WarningAlt size={40} style={{ color: pendingApiResponse ? 'var(--cds-icon-disabled)' : 'var(--cds-support-warning)' }} />
          </div>
          
          {/* Title */}
          <p style={{ 
            fontSize: '1.25rem', 
            fontWeight: 600, 
            marginBottom: '0.5rem',
            color: 'var(--cds-text-primary)'
          }}>
            {pendingApiResponse ? '正在記錄違規行為...' : '檢測到異常操作'}
          </p>
          
          {/* Event type */}
          <p style={{ 
            marginBottom: '1rem', 
            color: 'var(--cds-text-secondary)',
            fontSize: '0.875rem'
          }}>
            {warningEventType === 'tab_hidden' && '您切換了分頁'}
            {warningEventType === 'window_blur' && '您離開了視窗'}
            {warningEventType === 'exit_fullscreen' && '您退出了全螢幕'}
          </p>
          
          {/* Instruction */}
          <p style={{ 
            marginBottom: '1.5rem',
            fontSize: '0.875rem',
            color: 'var(--cds-text-primary)'
          }}>
            請保持在考試頁面並維持全螢幕模式。
          </p>
          
          {/* Violation count box */}
          {!pendingApiResponse && examState.violationCount !== undefined && examState.maxWarnings !== undefined && (
            <div style={{ 
              width: '100%', 
              backgroundColor: 'var(--cds-layer-01)', 
              padding: '1rem',
              border: '1px solid var(--cds-border-subtle)',
              marginBottom: '1rem'
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                marginBottom: '0.75rem',
                fontSize: '0.875rem'
              }}>
                <span style={{ color: 'var(--cds-text-secondary)' }}>累積違規次數</span>
                <span style={{ fontWeight: 600, color: 'var(--cds-support-error)' }}>{examState.violationCount}</span>
              </div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                fontSize: '0.875rem'
              }}>
                <span style={{ color: 'var(--cds-text-secondary)' }}>剩餘機會</span>
                <span style={{ 
                  fontWeight: 600, 
                  color: lastApiResponse?.locked ? 'var(--cds-support-error)' : 'var(--cds-support-success)'
                }}>
                  {lastApiResponse?.locked ? '0 - 已鎖定' : Math.max(0, (examState.maxWarnings + 1) - examState.violationCount)}
                </span>
              </div>
            </div>
          )}
          
          {/* Warning message */}
          {lastApiResponse?.locked ? (
            <p style={{ 
              marginTop: '0.5rem', 
              color: 'var(--cds-support-error)', 
              fontSize: '0.875rem', 
              fontWeight: 600 
            }}>
              您的考試已被鎖定！請聯繫監考老師。
            </p>
          ) : (
            <p style={{ 
              marginTop: '0.5rem', 
              color: 'var(--cds-support-error)', 
              fontSize: '0.75rem'
            }}>
              若剩餘機會歸零，您將被自動鎖定！
            </p>
          )}
        </div>
      </Modal>

      {/* Unlock Notification Modal */}
      <Modal
        open={showUnlockNotification}
        modalHeading="考試已解鎖"
        primaryButtonText="繼續考試"
        onRequestSubmit={() => setShowUnlockNotification(false)}
        onRequestClose={() => setShowUnlockNotification(false)}
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          {/* Icon */}
          <div style={{ 
            padding: '1rem',
            backgroundColor: 'var(--cds-notification-background-success)',
            borderRadius: '50%',
            marginBottom: '1.5rem'
          }}>
            <CheckmarkFilled size={40} style={{ color: 'var(--cds-support-success)' }} />
          </div>
          
          {/* Title */}
          <p style={{ 
            fontSize: '1.25rem', 
            fontWeight: 600, 
            marginBottom: '0.75rem',
            color: 'var(--cds-text-primary)'
          }}>
            您的考試已被解鎖！
          </p>
          
          {/* Description */}
          <p style={{ 
            marginBottom: '1.5rem',
            fontSize: '0.875rem',
            color: 'var(--cds-text-primary)',
            lineHeight: 1.5
          }}>
            監考老師已解除您的鎖定狀態。點擊「繼續考試」重新進入考試模式。
          </p>
          
          {/* Reminder */}
          <div style={{ 
            width: '100%',
            padding: '0.75rem 1rem',
            backgroundColor: 'var(--cds-layer-01)',
            border: '1px solid var(--cds-border-subtle)',
            textAlign: 'left'
          }}>
            <p style={{ 
              fontSize: '0.75rem', 
              color: 'var(--cds-text-secondary)',
              margin: 0
            }}>
              提醒：請遵守考試規則，避免再次被鎖定。
            </p>
          </div>
        </div>
      </Modal>

      {/* Fullscreen Exit Confirmation Modal (for locked/paused states) */}
      <Modal
        open={showFullscreenExitConfirm}
        modalHeading="確認離開全螢幕並交卷"
        primaryButtonText={isSubmittingFromFullscreenExit ? "交卷中..." : "確認交卷"}
        secondaryButtonText="取消"
        primaryButtonDisabled={isSubmittingFromFullscreenExit}
        onRequestSubmit={handleFullscreenExitConfirm}
        onRequestClose={handleFullscreenExitCancel}
        preventCloseOnClickOutside
        danger
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          {/* Icon */}
          <div style={{ 
            padding: '1rem',
            backgroundColor: 'var(--cds-notification-background-warning)',
            borderRadius: '50%',
            marginBottom: '1.5rem'
          }}>
            <WarningAlt size={40} style={{ color: 'var(--cds-support-warning)' }} />
          </div>
          
          {/* Title */}
          <p style={{ 
            fontSize: '1.25rem', 
            fontWeight: 600, 
            marginBottom: '0.75rem',
            color: 'var(--cds-text-primary)'
          }}>
            您正在離開全螢幕模式
          </p>
          
          {/* Description */}
          <p style={{ 
            marginBottom: '1.5rem',
            fontSize: '0.875rem',
            color: 'var(--cds-text-secondary)',
            lineHeight: 1.5
          }}>
            在考試模式下離開全螢幕將視為交卷。
            <br />
            確認後系統將自動為您交卷，您將無法再作答。
          </p>
          
          {/* Warning */}
          <div style={{ 
            width: '100%',
            padding: '0.75rem 1rem',
            backgroundColor: 'var(--cds-notification-background-error)',
            textAlign: 'center'
          }}>
            <p style={{ 
              fontSize: '0.875rem', 
              color: 'var(--cds-support-error)',
              margin: 0,
              fontWeight: 600
            }}>
              此操作無法復原！
            </p>
          </div>
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
