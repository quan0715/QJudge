import type { SubmissionStatus } from '@/core/entities/submission.entity';

export interface StatusConfig {
  color: string;          // Carbon tag color
  labelKey: string;       // i18n label key
  type: 'green' | 'red' | 'blue' | 'gray' | 'purple' | 'cyan' | 'teal' | 'magenta' | 'cool-gray' | 'warm-gray' | 'high-contrast' | 'outline';
}

export const SUBMISSION_STATUS_CONFIG: Record<SubmissionStatus, StatusConfig> = {
  'AC': { color: 'green', labelKey: 'common.status.success', type: 'green' },
  'WA': { color: 'red', labelKey: 'common.status.notPassed', type: 'red' },
  'TLE': { color: 'purple', labelKey: 'common.status.notPassed', type: 'purple' },
  'MLE': { color: 'purple', labelKey: 'common.status.notPassed', type: 'purple' },
  'RE': { color: 'red', labelKey: 'common.status.notPassed', type: 'red' },
  'CE': { color: 'red', labelKey: 'common.status.failed', type: 'red' },
  'KR': { color: 'red', labelKey: 'common.status.notPassed', type: 'red' },
  'NS': { color: 'gray', labelKey: 'common.status.draft', type: 'gray' },
  'pending': { color: 'gray', labelKey: 'common.status.pending', type: 'gray' },
  'judging': { color: 'blue', labelKey: 'common.status.processing', type: 'blue' },
  'SE': { color: 'red', labelKey: 'common.status.failed', type: 'red' },
  // TestCase result statuses (for unified handling)
  'passed': { color: 'green', labelKey: 'common.status.success', type: 'green' },
  'failed': { color: 'red', labelKey: 'common.status.failed', type: 'red' },
  // Test-run status for custom test cases (no expected output to compare)
  'info': { color: 'cyan', labelKey: 'common.status.active', type: 'cyan' },
};

export function getStatusConfig(status: SubmissionStatus): StatusConfig {
  return SUBMISSION_STATUS_CONFIG[status] || { color: 'gray', labelKey: status, type: 'gray' };
}

