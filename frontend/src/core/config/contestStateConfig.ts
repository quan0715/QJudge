import type { ContestStatus } from '@/core/entities/contest.entity';

export interface ContestStatusConfig {
  color: string;
  label: string;
  type: 'green' | 'blue' | 'gray' | 'purple' | 'red';
}

export const CONTEST_STATUS_CONFIG: Record<ContestStatus, ContestStatusConfig> = {
  'draft': { color: 'gray', label: '草稿', type: 'gray' },
  'published': { color: 'green', label: '已發布', type: 'green' },
  'archived': { color: 'purple', label: '已封存', type: 'purple' },
};

export function getContestStatusConfig(status: ContestStatus): ContestStatusConfig {
  return CONTEST_STATUS_CONFIG[status] || { color: 'gray', label: status, type: 'gray' };
}
