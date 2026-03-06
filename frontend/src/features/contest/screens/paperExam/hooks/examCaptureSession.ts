const CAPTURE_SESSION_KEY_PREFIX = "qjudge.exam.capture_session.v1";
const CAPTURE_NEXT_SEQ_KEY_PREFIX = "qjudge.exam.capture_seq.v1";

const keyFor = (contestId: string) => `${CAPTURE_SESSION_KEY_PREFIX}:${contestId}`;
const seqKeyFor = (contestId: string) => `${CAPTURE_NEXT_SEQ_KEY_PREFIX}:${contestId}`;

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

export const getExamCaptureNextSeq = (contestId?: string): number | null => {
  if (!contestId) return null;
  try {
    const value = window.sessionStorage.getItem(seqKeyFor(contestId));
    if (!value) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.floor(parsed);
  } catch {
    return null;
  }
};

export const setExamCaptureNextSeq = (contestId: string, nextSeq: number): void => {
  if (!contestId || !Number.isFinite(nextSeq) || nextSeq <= 0) return;
  try {
    window.sessionStorage.setItem(seqKeyFor(contestId), String(Math.floor(nextSeq)));
  } catch {
    // Ignore storage failures.
  }
};

export const clearExamCaptureSessionId = (contestId?: string): void => {
  if (!contestId) return;
  try {
    window.sessionStorage.removeItem(keyFor(contestId));
    window.sessionStorage.removeItem(seqKeyFor(contestId));
  } catch {
    // Ignore storage failures.
  }
};
