import { useEffect, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import type { ExamModeState, UserRole } from '@/models/contest';
import { api } from '@/services/api';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const isRecordingEvent = useRef(false);
  const isGracePeriod = useRef(false);

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
    // Disable anti-cheat on dashboard
    const isDashboard = location.pathname === `/contests/${contestId}` || location.pathname === `/contests/${contestId}/`;
    if (!examModeEnabled || !examState.isActive || isBypassed || isDashboard) return;

    // Event handlers
    const handleVisibilityChange = async () => {
      if (examState.isLocked || isGracePeriod.current) return;
      
      if (document.visibilityState === 'hidden' && !isRecordingEvent.current) {
        isRecordingEvent.current = true;
        const reason = '您已切換分頁，本次作答已被鎖定';
        await recordEvent('tab_hidden', reason);
        isRecordingEvent.current = false;
      }
    };

    const handleBlur = async () => {
      if (examState.isLocked || isGracePeriod.current) return;

      if (!isRecordingEvent.current) {
        isRecordingEvent.current = true;
        const reason = '您已離開視窗，本次作答已被鎖定';
        await recordEvent('window_blur', reason);
        isRecordingEvent.current = false;
      }
    };

    const handleFullscreenChange = async () => {
      if (examState.isLocked || isGracePeriod.current) return;

      if (!document.fullscreenElement && !isRecordingEvent.current) {
        isRecordingEvent.current = true;
        const reason = '您已退出全螢幕，本次作答已被鎖定';
        await recordEvent('exit_fullscreen', reason);
        isRecordingEvent.current = false;
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
      // @ts-ignore - API response type mismatch with current definition
      const res = await api.recordExamEvent(contestId, type, reason);
      
      if (res && typeof res === 'object') {
        const { locked, violation_count, max_warnings, bypass } = res;
        
        if (bypass) return;

        setExamState(prev => ({
          ...prev,
          violationCount: violation_count,
          maxWarnings: max_warnings
        }));

        if (locked) {
          lockExam(reason);
        } else if (violation_count > 0) {
          // Show warning if not locked but violation recorded
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

  return (
    <div ref={containerRef} style={{ position: 'relative', minHeight: '100vh' }}>
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
            <p style={{ fontSize: '1.2rem', color: '#ccc' }}>
              請聯繫監考老師解除鎖定。
            </p>
            <p style={{ fontSize: '1rem', marginTop: '2rem', color: '#999' }}>
              此違規行為已被記錄。
            </p>
            
            <div style={{ marginTop: '3rem' }}>
              <Button 
                kind="tertiary" 
                onClick={() => navigate(`/contests/${contestId}`)}
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
        onRequestSubmit={() => setShowWarning(false)}
        onRequestClose={() => setShowWarning(false)}
        danger
        size="xs"
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <WarningAlt size={64} style={{ color: '#f1c21b', marginBottom: '1rem' }} />
          <p style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            檢測到異常操作
          </p>
          <p style={{ marginBottom: '1rem' }}>
            請保持在考試頁面並維持全螢幕模式。
          </p>
          {examState.maxWarnings !== undefined && examState.maxWarnings > 0 && (
            <p style={{ color: '#da1e28' }}>
              累積違規次數：{examState.violationCount} / {examState.maxWarnings + 1}
              <br />
              若再次違規將會被鎖定！
            </p>
          )}
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
  onSuccess?: () => void
) => {
  const startExam = async () => {
    try {
      await api.startExam(contestId);
      
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
      await api.endExam(contestId);
      
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
