import React from 'react';
import { Tag } from '@carbon/react';
import { getContestStatusConfig } from '@/core/config/contestStateConfig';
import type { ContestStatus } from '@/core/entities/contest.entity';

interface Props {
  status: ContestStatus | string;
  size?: 'sm' | 'md';
  className?: string;
}

export const ContestStatusBadge: React.FC<Props> = ({ status, size = 'md', className }) => {
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
