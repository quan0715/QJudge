import { authFetch } from './auth';
import type { AuthResponse } from '@/models/auth';

const API_BASE = '/api/v1/auth';

export const authService = {
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

  getUserStats: async (): Promise<any> => {
    const res = await authFetch(`${API_BASE}/me/stats`);
    if (!res.ok) throw new Error('Failed to fetch user stats');
    const data = await res.json();
    return data.data;
  },
};
