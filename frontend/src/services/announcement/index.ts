import { httpClient } from '@/services/api/httpClient';

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

export const getAnnouncements = async (): Promise<Announcement[]> => {
  const res = await httpClient.get('/api/v1/management/announcements/');
  if (!res.ok) throw new Error('Failed to fetch announcements');
  const data = await res.json();
  return data.results || data;
};

export const getAnnouncement = async (id: number): Promise<Announcement> => {
  const res = await httpClient.get(`/api/v1/management/announcements/${id}/`);
  if (!res.ok) throw new Error('Failed to fetch announcement');
  return res.json();
};

export const createAnnouncement = async (data: CreateAnnouncementRequest): Promise<Announcement> => {
  const res = await httpClient.post('/api/v1/management/announcements/', data);
  if (!res.ok) throw new Error('Failed to create announcement');
  return res.json();
};

export const updateAnnouncement = async (id: number, data: UpdateAnnouncementRequest): Promise<Announcement> => {
  const res = await httpClient.patch(`/api/v1/management/announcements/${id}/`, data);
  if (!res.ok) throw new Error('Failed to update announcement');
  return res.json();
};

export const deleteAnnouncement = async (id: number): Promise<void> => {
  const res = await httpClient.delete(`/api/v1/management/announcements/${id}/`);
  if (!res.ok) throw new Error('Failed to delete announcement');
};

export default {
  getAnnouncements,
  getAnnouncement,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement
};
