import { authFetch } from './auth';
import type { Problem } from '@/models/problem';

export const problemService = {
  getProblems: async (scope?: string): Promise<Problem[]> => {
    const query = scope ? `?scope=${scope}` : '';
    const res = await authFetch(`/api/v1/problems/${query}`);
    if (!res.ok) {
      throw new Error('Failed to fetch problems');
    }
    const data = await res.json();
    // Handle both paginated and non-paginated responses
    return data.results || data;
  },

  getProblem: async (id: string, scope?: string): Promise<Problem | undefined> => {
    const query = scope ? `?scope=${scope}` : '';
    const res = await authFetch(`/api/v1/problems/${id}/${query}`);
    if (!res.ok) {
      return undefined;
    }
    return res.json();
  },
};
