import { authFetch } from './auth';

export const submissionService = {
  submitSolution: async (data: { problem_id: string; language: string; code: string; contest_id?: string; is_test?: boolean }): Promise<any> => {
    const res = await authFetch(`/api/v1/submissions/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        problem: data.problem_id,
        language: data.language,
        code: data.code,
        contest: data.contest_id,
        is_test: data.is_test
      }),
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.detail || 'Submission failed');
    }
    return res.json();
  },

  getSubmissions: async (params?: { source_type?: 'practice' | 'contest', contest_id?: string, problem_id?: string }): Promise<any[]> => {
    const queryParams = new URLSearchParams();
    if (params?.source_type) queryParams.append('source_type', params.source_type);
    if (params?.contest_id) queryParams.append('contest', params.contest_id);
    if (params?.problem_id) queryParams.append('problem', params.problem_id);
    
    const res = await authFetch(`/api/v1/submissions/?${queryParams.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch submissions');
    const data = await res.json();
    return data.results || data;
  },

  getSubmission: async (id: string): Promise<any> => {
    const res = await authFetch(`/api/v1/submissions/${id}/`);
    if (!res.ok) {
        if (res.status === 403) {
            throw new Error('Permission denied');
        }
        throw new Error('Failed to fetch submission');
    }
    return res.json();
  },
};
