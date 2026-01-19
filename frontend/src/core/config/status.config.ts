import type { SubmissionStatus } from '@/core/entities/submission.entity';

export interface StatusConfig {
  color: string;          // Carbon tag color
  label: string;          // Display label
  type: 'green' | 'red' | 'blue' | 'gray' | 'purple' | 'cyan' | 'teal' | 'magenta' | 'cool-gray' | 'warm-gray' | 'high-contrast' | 'outline';
}

export const SUBMISSION_STATUS_CONFIG: Record<SubmissionStatus, StatusConfig> = {
  'AC': { color: 'green', label: '通過', type: 'green' },
  'WA': { color: 'red', label: '答案錯誤', type: 'red' },
  'TLE': { color: 'purple', label: '超時', type: 'purple' },
  'MLE': { color: 'purple', label: '記憶體超限', type: 'purple' },
  'RE': { color: 'red', label: '執行錯誤', type: 'red' },
  'CE': { color: 'red', label: '編譯錯誤', type: 'red' },
  'KR': { color: 'red', label: '關鍵字限制', type: 'red' },
  'NS': { color: 'gray', label: '未提交', type: 'gray' },
  'pending': { color: 'gray', label: '等待中', type: 'gray' },
  'judging': { color: 'blue', label: '評測中', type: 'blue' },
  'SE': { color: 'red', label: '系統錯誤', type: 'red' },
  // TestCase result statuses (for unified handling)
  'passed': { color: 'green', label: '通過', type: 'green' },
  'failed': { color: 'red', label: '失敗', type: 'red' },
  // Test-run status for custom test cases (no expected output to compare)
  'info': { color: 'cyan', label: '執行結果', type: 'cyan' },
};

export function getStatusConfig(status: SubmissionStatus): StatusConfig {
  return SUBMISSION_STATUS_CONFIG[status] || { color: 'gray', label: status, type: 'gray' };
}

