import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";

/** Raw DTO returned by the API before mapping */
interface ContestAnnouncementDto {
  id: number | string;
  title: string;
  content: string;
  created_by?: { username?: string };
  created_at: string;
  updated_at: string;
}

export const getContestAnnouncements = async (
  id: string
): Promise<ContestAnnouncementDto[]> => {
  return requestJson<ContestAnnouncementDto[]>(
    httpClient.get(`/api/v1/contests/${id}/announcements/`),
    "Failed to fetch announcements"
  );
};

export const createContestAnnouncement = async (
  contestId: string,
  data: { title: string; content: string }
): Promise<ContestAnnouncementDto> => {
  return requestJson<ContestAnnouncementDto>(
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
