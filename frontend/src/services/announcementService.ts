import { authFetch } from './auth';

export interface Announcement {
  id: number;
  title: string;
  content: string;
  author: {
    username: string;
    role: string;
  };
  visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAnnouncementRequest {
  title: string;
  content: string;
  visible?: boolean;
}

export interface UpdateAnnouncementRequest {
  title?: string;
  content?: string;
  visible?: boolean;
}

export const announcementService = {
  getAll: async (): Promise<Announcement[]> => {
    const response = await authFetch('/api/v1/management/announcements/');
    if (!response.ok) throw new Error('Failed to fetch announcements');
    const data = await response.json();
    return data.results || data;
  },

  getById: async (id: number): Promise<Announcement> => {
    const response = await authFetch(`/api/v1/management/announcements/${id}/`);
    if (!response.ok) throw new Error('Failed to fetch announcement');
    return response.json();
  },

  create: async (data: CreateAnnouncementRequest): Promise<Announcement> => {
    const response = await authFetch('/api/v1/management/announcements/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to create announcement');
    return response.json();
  },

  update: async (id: number, data: UpdateAnnouncementRequest): Promise<Announcement> => {
    const response = await authFetch(`/api/v1/management/announcements/${id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to update announcement');
    return response.json();
  },

  delete: async (id: number): Promise<void> => {
    const response = await authFetch(`/api/v1/management/announcements/${id}/`, {
        method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete announcement');
  },
};
