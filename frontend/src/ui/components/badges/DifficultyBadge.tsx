import React from 'react';
import { Tag } from '@carbon/react';
import { getDifficultyConfig } from '@/core/config/difficultyConfig';
import type { Difficulty } from '@/core/entities/problem.entity';

interface Props {
  difficulty: Difficulty | string;
  size?: 'sm' | 'md';
  className?: string;
}

export const DifficultyBadge: React.FC<Props> = ({ difficulty, size = 'md', className }) => {
  const config = getDifficultyConfig(difficulty as Difficulty);
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
