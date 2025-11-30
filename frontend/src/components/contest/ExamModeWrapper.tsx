import { useEffect, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import type { ExamModeState } from '@/types/contest';
import { api } from '@/services/api';

interface ExamModeWrapperProps {
  contestId: string;
  examModeEnabled: boolean;
  isActive: boolean;
  onExamStart?: () => void;
  onExamEnd?: () => void;
  children: ReactNode;
}

const ExamModeWrapper: React.FC<ExamModeWrapperProps> = ({
  contestId,
  examModeEnabled,
  isActive,
  children
}) => {
  const [examState, setExamState] = useState<ExamModeState>({
    isActive: false,
    isLocked: false
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const isRecordingEvent = useRef(false);

  useEffect(() => {
    setExamState(prev => ({ ...prev, isActive }));
  }, [isActive]);

  useEffect(() => {
    if (!examModeEnabled || !examState.isActive) return;

    // Event handlers
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden' && !isRecordingEvent.current) {
        isRecordingEvent.current = true;
        await api.recordExamEvent(contestId, 'tab_hidden');
        lockExam('您已切換分頁，本次作答已被鎖定');
        isRecordingEvent.current = false;
      }
    };

    const handleBlur = async () => {
      if (!isRecordingEvent.current) {
        isRecordingEvent.current = true;
        await api.recordExamEvent(contestId, 'window_blur');
        lockExam('您已離開視窗，本次作答已被鎖定');
        isRecordingEvent.current = false;
      }
    };

    const handleFullscreenChange = async () => {
      if (!document.fullscreenElement && !isRecordingEvent.current) {
        isRecordingEvent.current = true;
        await api.recordExamEvent(contestId, 'exit_fullscreen');
        lockExam('您已退出全螢幕，本次作答已被鎖定');
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
  }, [examModeEnabled, examState.isActive, contestId]);

  const lockExam = (reason: string) => {
    setExamState(prev => ({
      ...prev,
      isLocked: true,
      lockReason: reason
    }));
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', minHeight: '100vh' }}>
      {children}

      {/* Lock Overlay */}
      {examState.isLocked && (
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
          </div>
        </div>
      )}
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
