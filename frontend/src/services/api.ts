import { authFetch } from './auth';

const API_BASE = '/api/v1/auth';

export interface Problem {
  id: string;
  display_id?: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  acceptance_rate: number;
  submission_count?: number;
  accepted_count?: number;
  created_by?: string;
}

export interface AuthResponse {
  success: boolean;
  data: {
    access_token: string;
    refresh_token: string;
    user: {
      username: string;
      email: string;
    };
  };
}

export const api = {
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

  getProblem: async (id: string): Promise<Problem | undefined> => {
    const res = await authFetch(`/api/v1/problems/${id}/`);
    if (!res.ok) {
      return undefined;
    }
    return res.json();
  },

  login: async (data: any): Promise<AuthResponse> => {
    const res = await fetch(`${API_BASE}/email/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errorData = await res.json();
      const error: any = new Error('Login failed');
      error.response = { data: errorData };
      throw error;
    }
    return res.json();
  },

  register: async (data: any): Promise<AuthResponse> => {
    const res = await fetch(`${API_BASE}/email/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errorData = await res.json();
      const error: any = new Error('Registration failed');
      error.response = { data: errorData };
      throw error;
    }
    return res.json();
  },

  getOAuthUrl: async (provider: string): Promise<string> => {
    const res = await fetch(`${API_BASE}/${provider}/login`);
    if (!res.ok) throw new Error('Failed to get OAuth URL');
    const data = await res.json();
    return data.data.authorization_url;
  },

  oauthCallback: async (data: { code: string; redirect_uri: string }): Promise<AuthResponse> => {
    const res = await fetch(`${API_BASE}/nycu/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('OAuth callback failed');
    return res.json();
  },

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

  // User management (admin only)
  searchUsers: async (query: string): Promise<any> => {
    const res = await authFetch(`/api/v1/auth/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) {
      const errorData = await res.json();
      const error: any = new Error('Search failed');
      error.response = { data: errorData };
      throw error;
    }
    return res.json();
  },

  updateUserRole: async (userId: number, role: string): Promise<any> => {
    const res = await authFetch(`/api/v1/auth/${userId}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const errorData = await res.json();
      const error: any = new Error('Update failed');
      error.response = { data: errorData };
      throw error;
    }
    return res.json();
  },

  // Contest API
  getContests: async (scope?: string): Promise<Contest[]> => {
    const query = scope ? `?scope=${scope}` : '';
    const res = await authFetch(`/api/v1/contests/${query}`);
    if (!res.ok) throw new Error('Failed to fetch contests');
    const data = await res.json();
    return data.results || data;
  },

  getContest: async (id: string): Promise<Contest | undefined> => {
    const res = await authFetch(`/api/v1/contests/${id}/`);
    if (!res.ok) return undefined;
    return res.json();
  },

  createContest: async (data: any): Promise<Contest> => {
    const res = await authFetch('/api/v1/contests/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.detail || 'Failed to create contest');
    }
    return res.json();
  },

  updateContest: async (id: string, data: any): Promise<Contest> => {
    const res = await authFetch(`/api/v1/contests/${id}/`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.detail || 'Failed to update contest');
    }
    return res.json();
  },

  deleteContest: async (id: string): Promise<void> => {
    const res = await authFetch(`/api/v1/contests/${id}/`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete contest');
  },

  registerContest: async (id: string, password?: string): Promise<any> => {
    const res = await authFetch(`/api/v1/contests/${id}/register/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password })
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.message || 'Registration failed');
    }
    return res.json();
  },

  enterContest: async (id: string): Promise<any> => {
    const res = await authFetch(`/api/v1/contests/${id}/enter/`, {
      method: 'POST'
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.message || 'Failed to enter contest');
    }
    return res.json();
  },

  leaveContest: async (id: string): Promise<any> => {
    const res = await authFetch(`/api/v1/contests/${id}/leave/`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to leave contest');
    return res.json();
  },

  getContestAnnouncements: async (id: string): Promise<any[]> => {
    const res = await authFetch(`/api/v1/contests/${id}/announcements/`);
    if (!res.ok) throw new Error('Failed to fetch announcements');
    return res.json();
  },

  createContestAnnouncement: async (contestId: string, data: { title: string; content: string }): Promise<any> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/announcements/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create announcement');
    return res.json();
  },

  deleteContestAnnouncement: async (contestId: string, announcementId: string): Promise<void> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/announcements/${announcementId}/`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete announcement');
  },

  getContestStandings: async (id: string): Promise<any[]> => {
    const res = await authFetch(`/api/v1/contests/${id}/standings/`);
    if (!res.ok) throw new Error('Failed to fetch standings');
    return res.json();
  },

  addContestProblem: async (contestId: string, sourceProblemId: string | null, title?: string): Promise<Problem> => {
    const res = await authFetch(`/api/v1/contests/${contestId}/add_problem/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source_problem_id: sourceProblemId,
        title: title
      })
    });
    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to add problem');
    }
    return res.json();
  },
};

export interface Contest {
  id: string;
  title: string;
  description: string;
  rules?: string;
  start_time: string;
  end_time: string;
  status: 'upcoming' | 'running' | 'ended';
  is_private: boolean;
  is_registered: boolean;
  has_left: boolean;
  allow_view_results?: boolean;
  allow_multiple_joins?: boolean;
  ban_tab_switching?: boolean;
}
