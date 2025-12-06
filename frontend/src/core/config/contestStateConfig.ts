import type { ContestStatus } from '@/core/entities/contest.entity';

export interface ContestStatusConfig {
  color: string;
  label: string;
  type: 'green' | 'blue' | 'gray' | 'purple' | 'red';
}

export const CONTEST_STATUS_CONFIG: Record<ContestStatus, ContestStatusConfig> = {
  'active': { color: 'green', label: '進行中', type: 'green' },
  'inactive': { color: 'blue', label: '未開始', type: 'blue' },
  'ended': { color: 'gray', label: '已結束', type: 'gray' },
  'archived': { color: 'purple', label: '已封存', type: 'purple' },
};

export function getContestStatusConfig(status: ContestStatus): ContestStatusConfig {
  return CONTEST_STATUS_CONFIG[status] || { color: 'gray', label: status, type: 'gray' };
}
