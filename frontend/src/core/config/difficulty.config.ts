import type { Difficulty } from '@/core/entities/problem.entity';

export interface DifficultyConfig {
  color: string;
  labelKey: string;
  type: 'green' | 'cyan' | 'red' | 'gray';
}

export const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  'easy': { color: 'green', labelKey: 'difficulty.easy', type: 'green' },
  'medium': { color: 'cyan', labelKey: 'difficulty.medium', type: 'cyan' },
  'hard': { color: 'red', labelKey: 'difficulty.hard', type: 'red' },
};

export function getDifficultyConfig(difficulty: Difficulty): DifficultyConfig {
  return DIFFICULTY_CONFIG[difficulty] || { color: 'gray', labelKey: difficulty, type: 'gray' };
}
