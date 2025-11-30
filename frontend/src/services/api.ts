import { authService } from './authService';
import { problemService } from './problemService';
import { submissionService } from './submissionService';
import { contestService } from './contestService';

// Re-export types for backward compatibility
export type { Problem } from '@/models/problem';
export type { AuthResponse } from '@/models/auth';
export type { Contest, ContestQuestion } from '@/models/contest';

export const api = {
  ...authService,
  ...problemService,
  ...submissionService,
  ...contestService,
};
