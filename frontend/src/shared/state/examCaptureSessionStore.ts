const CAPTURE_SESSION_KEY_PREFIX = "qjudge.exam.capture_session.v1";

const keyFor = (contestId: string) => `${CAPTURE_SESSION_KEY_PREFIX}:${contestId}`;

export const getExamCaptureSessionId = (contestId?: string): string | null => {
  if (!contestId) return null;
  try {
    const value = window.sessionStorage.getItem(keyFor(contestId));
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
};

export const setExamCaptureSessionId = (contestId: string, uploadSessionId: string): void => {
  if (!contestId || !uploadSessionId) return;
  try {
    window.sessionStorage.setItem(keyFor(contestId), uploadSessionId);
  } catch {
    // Ignore storage failures.
  }
};

export const clearExamCaptureSessionId = (contestId?: string): void => {
  if (!contestId) return;
  try {
    window.sessionStorage.removeItem(keyFor(contestId));
  } catch {
    // Ignore storage failures.
  }
};
