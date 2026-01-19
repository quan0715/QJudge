import React from 'react';
import { Tag } from '@carbon/react';
import { getContestStatusConfig } from '@/core/config/contestState.config';
import type { ContestStatus } from '@/core/entities/contest.entity';

export interface ContestStatusBadgeProps {
  /** Contest status */
  status: ContestStatus | string;
  /** Badge size */
  size?: 'sm' | 'md';
  /** Additional CSS class */
  className?: string;
}

/**
 * Badge for displaying contest status (draft, published, archived).
 */
export const ContestStatusBadge: React.FC<ContestStatusBadgeProps> = ({ 
  status, 
  size = 'md', 
  className 
}) => {
  const config = getContestStatusConfig(status as ContestStatus);
  return (
    <Tag 
      type={config.type} 
      size={size} 
      className={className}
      title={config.label}
    >
      {config.label}
    </Tag>
  );
};
