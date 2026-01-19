/**
 * Announcement Repository Implementation
 *
 * System-wide announcements management.
 */

import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Announcement Repository Implementation
// ============================================================================

export const getAnnouncements = async (): Promise<Announcement[]> => {
  const data = await requestJson<any>(
    httpClient.get("/api/v1/management/announcements/"),
    "Failed to fetch announcements"
  );
  return data.results || data;
};

export const getAnnouncement = async (id: number): Promise<Announcement> => {
  return requestJson<Announcement>(
    httpClient.get(`/api/v1/management/announcements/${id}/`),
    "Failed to fetch announcement"
  );
};

export const createAnnouncement = async (
  data: CreateAnnouncementRequest
): Promise<Announcement> => {
  return requestJson<Announcement>(
    httpClient.post("/api/v1/management/announcements/", data),
    "Failed to create announcement"
  );
};

export const updateAnnouncement = async (
  id: number,
  data: UpdateAnnouncementRequest
): Promise<Announcement> => {
  return requestJson<Announcement>(
    httpClient.patch(`/api/v1/management/announcements/${id}/`, data),
    "Failed to update announcement"
  );
};

export const deleteAnnouncement = async (id: number): Promise<void> => {
  await ensureOk(
    httpClient.delete(`/api/v1/management/announcements/${id}/`),
    "Failed to delete announcement"
  );
};

// ============================================================================
// Default Export
// ============================================================================

export default {
  getAnnouncements,
  getAnnouncement,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
};
