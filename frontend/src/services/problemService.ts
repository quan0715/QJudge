import { authFetch } from './auth';
import type { Problem, ProblemDetail } from '@/core/entities/problem.entity';
import { mapProblemDto, mapProblemDetailDto } from '@/core/entities/mappers/problemMapper';

export const problemService = {
  getProblems: async (scope?: string): Promise<Problem[]> => {
    const query = scope ? `?scope=${scope}` : '';
    const res = await authFetch(`/api/v1/problems/${query}`);
    if (!res.ok) {
      throw new Error('Failed to fetch problems');
    }
    const data = await res.json();
    // Handle both paginated and non-paginated responses
    const results = data.results || data;
    return Array.isArray(results) ? results.map(mapProblemDto) : [];
  },

  getProblem: async (id: string, scope?: string): Promise<ProblemDetail | undefined> => {
    const query = scope ? `?scope=${scope}` : '';
    const res = await authFetch(`/api/v1/problems/${id}/${query}`);
    if (!res.ok) {
      return undefined;
    }
    const data = await res.json();
    return mapProblemDetailDto(data);
  },
};
