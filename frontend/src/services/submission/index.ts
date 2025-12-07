import { httpClient } from '@/services/api/httpClient';
import type { Submission, SubmissionDetail } from '@/core/entities/submission.entity';
import { mapSubmissionDto, mapSubmissionDetailDto } from '@/core/entities/mappers/submissionMapper';

export const submitSolution = async (data: { 
  problem_id: string; 
  language: string; 
  code: string; 
  contest_id?: string; 
  is_test?: boolean; 
  custom_test_cases?: any[] 
}): Promise<SubmissionDetail> => {
  const res = await httpClient.post(`/api/v1/submissions/`, {
    problem: data.problem_id,
    language: data.language,
    code: data.code,
    contest: data.contest_id,
    is_test: data.is_test,
    custom_test_cases: data.custom_test_cases
  });

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.detail || 'Submission failed');
  }
  
  const responseData = await res.json();
  return mapSubmissionDetailDto(responseData);
};

export const getSubmissions = async (params?: any): Promise<{ results: Submission[], count: number }> => {
  const queryParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) queryParams.append(key, String(value));
    });
  }
  
  const res = await httpClient.get(`/api/v1/submissions/?${queryParams.toString()}`);
  
  if (!res.ok) throw new Error('Failed to fetch submissions');
  
  const data = await res.json();
  const results = data.results || data;
  const count = data.count || (Array.isArray(data) ? data.length : 0);
  return { results: Array.isArray(results) ? results.map(mapSubmissionDto) : [], count };
};

export const getSubmission = async (id: string): Promise<SubmissionDetail> => {
  const res = await httpClient.get(`/api/v1/submissions/${id}/`);
  
  if (!res.ok) {
    if (res.status === 403) {
      throw new Error('Permission denied');
    }
    throw new Error('Failed to fetch submission');
  }
  
  const data = await res.json();
  return mapSubmissionDetailDto(data);
};

export default {
  submitSolution,
  getSubmissions,
  getSubmission,
};
