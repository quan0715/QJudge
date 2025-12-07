import React from 'react';
import { Tag } from '@carbon/react';
import { getStatusConfig } from '@/core/config/statusConfig';
import type { SubmissionStatus } from '@/core/entities/submission.entity';

interface Props {
  status: SubmissionStatus | string; // Allow string for flexibility during migration
  size?: 'sm' | 'md';
  className?: string;
}

export const SubmissionStatusBadge: React.FC<Props> = ({ status, size = 'md', className }) => {
  const config = getStatusConfig(status as SubmissionStatus);
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
