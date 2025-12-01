import { authService } from './authService';
import { problemService } from './problemService';
import { submissionService } from './submissionService';
import { contestService } from './contestService';
import { authFetch } from './auth';

// Re-export types for backward compatibility
export type { Problem } from '@/models/problem';
export type { AuthResponse } from '@/models/auth';
export type { Contest, ContestQuestion } from '@/models/contest';

export const api = {
  ...authService,
  ...problemService,
  ...submissionService,
  ...contestService,
  updateContest: async (id: string, data: any): Promise<any> => {
    const res = await authFetch(`/api/v1/contests/${id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update contest');
    return res.json();
  },

  getContestActivities: async (id: string): Promise<any[]> => {
    const res = await authFetch(`/api/v1/contests/${id}/activities/`);
    if (!res.ok) return [];
    return res.json();
  },
};
