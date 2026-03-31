/**
 * Announcement Repository Implementation
 *
 * System-wide announcements management.
 */

import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import type {
  Announcement,
  CreateAnnouncementRequest,
  UpdateAnnouncementRequest,
} from "@/core/entities/announcement.entity";

// Re-export entity types for backward compatibility
export type { Announcement, CreateAnnouncementRequest, UpdateAnnouncementRequest };

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
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
};
