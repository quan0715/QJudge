import { httpClient } from '@/services/api/httpClient';
import type { Problem, ProblemDetail } from '@/core/entities/problem.entity';
import { mapProblemDto, mapProblemDetailDto } from '@/core/entities/mappers/problemMapper';

export const getProblems = async (scope?: string): Promise<Problem[]> => {
  const query = scope ? `?scope=${scope}` : '';
  const res = await httpClient.get(`/api/v1/problems/${query}`);
  
  if (!res.ok) {
    throw new Error('Failed to fetch problems');
  }
  
  const data = await res.json();
  const results = data.results || data;
  return Array.isArray(results) ? results.map(mapProblemDto) : [];
};

export const getProblem = async (id: string, scope?: string): Promise<ProblemDetail | undefined> => {
  const query = scope ? `?scope=${scope}` : '';
  const res = await httpClient.get(`/api/v1/problems/${id}/${query}`);
  
  if (!res.ok) {
    return undefined;
  }
  
  const data = await res.json();
  return mapProblemDetailDto(data);
};

export const createProblem = async (data: any): Promise<ProblemDetail> => {
  const res = await httpClient.post('/api/v1/problems/', data);
  if (!res.ok) {
     const errorData = await res.json();
     throw new Error(errorData.message || 'Failed to create problem');
  }
  return res.json();
};

export const updateProblem = async (id: string, data: any): Promise<ProblemDetail> => {
  const res = await httpClient.put(`/api/v1/problems/${id}/?scope=manage`, data);
  if (!res.ok) {
     const errorData = await res.json();
     throw new Error(JSON.stringify(errorData) || 'Failed to update problem');
  }
  return res.json();
};

export const deleteProblem = async (id: string): Promise<void> => {
  const res = await httpClient.delete(`/api/v1/problems/${id}/`);
  if (!res.ok) throw new Error('Failed to delete problem');
};

export const getTags = async (): Promise<any[]> => {
  const res = await httpClient.get('/api/v1/problems/tags/');
  if (!res.ok) {
     // If tags endpoint fails, return empty array to not break the form
     console.warn('Failed to fetch tags'); 
     return [];
  }
  const data = await res.json();
  return Array.isArray(data) ? data : (data.results || data.tags || []);
};

export default {
  getProblems,
  getProblem,
  createProblem,
  updateProblem,
  deleteProblem,
  getTags,
};
