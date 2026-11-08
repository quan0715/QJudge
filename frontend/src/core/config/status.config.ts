import type { SubmissionStatus } from '@/core/entities/submission.entity';

export interface StatusConfig {
  color: string;          // Carbon tag color
  labelKey: string;       // i18n label key
  type: 'green' | 'red' | 'blue' | 'gray' | 'purple' | 'cyan' | 'teal' | 'magenta' | 'cool-gray' | 'warm-gray' | 'high-contrast' | 'outline';
}

/** How often a pending or judging submission is re-fetched. */
export const SUBMISSION_POLL_INTERVAL_MS = 2000;

export const SUBMISSION_STATUS_CONFIG: Record<SubmissionStatus, StatusConfig> = {
  'AC': { color: 'green', labelKey: 'common:status.success', type: 'green' },
  'WA': { color: 'red', labelKey: 'common:status.notPassed', type: 'red' },
  'TLE': { color: 'purple', labelKey: 'common:status.notPassed', type: 'purple' },
  'MLE': { color: 'purple', labelKey: 'common:status.notPassed', type: 'purple' },
  'RE': { color: 'red', labelKey: 'common:status.notPassed', type: 'red' },
  'CE': { color: 'red', labelKey: 'common:status.failed', type: 'red' },
  'KR': { color: 'red', labelKey: 'common:status.notPassed', type: 'red' },
  'NS': { color: 'gray', labelKey: 'common:status.draft', type: 'gray' },
  'pending': { color: 'gray', labelKey: 'common:status.pending', type: 'gray' },
  'judging': { color: 'blue', labelKey: 'common:action.processing', type: 'blue' },
  'SE': { color: 'red', labelKey: 'common:status.failed', type: 'red' },
  // TestCase result statuses (for unified handling)
  'passed': { color: 'green', labelKey: 'common:status.success', type: 'green' },
  'failed': { color: 'red', labelKey: 'common:status.failed', type: 'red' },
  // Test-run status for custom test cases (no expected output to compare)
  'info': { color: 'cyan', labelKey: 'common:status.active', type: 'cyan' },
};

/** Judge verdicts by name, for students reading their own result; zh-TW is the fallback text. */
const VERDICTS: Partial<Record<SubmissionStatus, [key: string, fallback: string]>> = {
  AC: ['common:verdict.AC', '通過'],
  WA: ['common:verdict.WA', '答案錯誤'],
  TLE: ['common:verdict.TLE', '執行超時'],
  MLE: ['common:verdict.MLE', '記憶體超限'],
  RE: ['common:verdict.RE', '執行錯誤'],
  CE: ['common:verdict.CE', '編譯錯誤'],
  SE: ['common:verdict.SE', '系統錯誤'],
  KR: ['common:verdict.KR', '強制終止'],
};

/** The verdict's own name (e.g. 答案錯誤) where there is one, otherwise the generic status label. */
export function translateVerdict(t: (key: string, fallback: string) => string, status: SubmissionStatus | string): string {
  const verdict = VERDICTS[status as SubmissionStatus];
  return verdict ? t(verdict[0], verdict[1]) : t(getStatusConfig(status as SubmissionStatus).labelKey, status);
}

export function getStatusConfig(status: SubmissionStatus): StatusConfig {
  return SUBMISSION_STATUS_CONFIG[status] || { color: 'gray', labelKey: status, type: 'gray' };
}

