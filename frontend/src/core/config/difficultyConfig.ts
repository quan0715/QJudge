import type { Difficulty } from '@/core/entities/problem.entity';

export interface DifficultyConfig {
  color: string;
  label: string;
  type: 'green' | 'cyan' | 'red' | 'gray';
}

export const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  'easy': { color: 'green', label: '簡單', type: 'green' },
  'medium': { color: 'cyan', label: '中等', type: 'cyan' },
  'hard': { color: 'red', label: '困難', type: 'red' },
};

export function getDifficultyConfig(difficulty: Difficulty): DifficultyConfig {
  return DIFFICULTY_CONFIG[difficulty] || { color: 'gray', label: difficulty, type: 'gray' };
}
