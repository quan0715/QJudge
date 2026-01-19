import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";

export const getContestAnnouncements = async (
  id: string
): Promise<any[]> => {
  return requestJson<any[]>(
    httpClient.get(`/api/v1/contests/${id}/announcements/`),
    "Failed to fetch announcements"
  );
};

export const createContestAnnouncement = async (
  contestId: string,
  data: { title: string; content: string }
): Promise<any> => {
  return requestJson<any>(
    httpClient.post(`/api/v1/contests/${contestId}/announcements/`, data),
    "Failed to create announcement"
  );
};

export const deleteContestAnnouncement = async (
  contestId: string,
  announcementId: string
): Promise<void> => {
  await ensureOk(
    httpClient.delete(
      `/api/v1/contests/${contestId}/announcements/${announcementId}/`
    ),
    "Failed to delete announcement"
  );
};
