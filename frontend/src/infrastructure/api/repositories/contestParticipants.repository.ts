import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";
import type { ContestParticipant } from "@/core/entities/contest.entity";
import { mapContestParticipantDto } from "@/infrastructure/mappers";

export const getContestParticipants = async (
  contestId: string
): Promise<ContestParticipant[]> => {
  const data = await requestJson<any>(
    httpClient.get(`/api/v1/contests/${contestId}/participants/`),
    "Failed to fetch participants"
  );
  return Array.isArray(data) ? data.map(mapContestParticipantDto) : [];
};

export const unlockParticipant = async (
  contestId: string,
  userId: number
): Promise<void> => {
  await ensureOk(
    httpClient.post(`/api/v1/contests/${contestId}/unlock_participant/`, {
      user_id: userId,
    }),
    "Failed to unlock participant"
  );
};

export const updateNickname = async (
  contestId: string,
  nickname: string
): Promise<any> => {
  return requestJson<any>(
    httpClient.post(`/api/v1/contests/${contestId}/update_nickname/`, {
      nickname,
    }),
    "Failed to update nickname"
  );
};

export const updateParticipant = async (
  contestId: string,
  userId: number,
  data: any
): Promise<void> => {
  await ensureOk(
    httpClient.patch(`/api/v1/contests/${contestId}/update_participant/`, {
      user_id: userId,
      ...data,
    }),
    "Failed to update participant"
  );
};

export const addContestParticipant = async (
  contestId: string,
  username: string
): Promise<void> => {
  await ensureOk(
    httpClient.post(`/api/v1/contests/${contestId}/add_participant/`, {
      username,
    }),
    "Failed to add participant"
  );
};

export const reopenExam = async (
  contestId: string,
  userId: number
): Promise<void> => {
  await ensureOk(
    httpClient.post(`/api/v1/contests/${contestId}/reopen_exam/`, {
      user_id: userId,
    }),
    "Failed to reopen exam"
  );
};

export const removeParticipant = async (
  contestId: string,
  userId: number
): Promise<void> => {
  await ensureOk(
    httpClient.post(`/api/v1/contests/${contestId}/remove_participant/`, {
      user_id: userId,
    }),
    "Failed to remove participant"
  );
};

/**
 * Download individual participant's exam report as PDF (Admin only)
 * @param contestId - Contest ID
 * @param userId - Target user ID
 * @param language - Report language (default: zh-TW)
 * @param scale - PDF scale factor (0.5 to 2.0, default 1.0)
 */
export const downloadParticipantReport = async (
  contestId: string,
  userId: string | number,
  language: string = "zh-TW",
  scale: number = 1.0
): Promise<void> => {
  const token = localStorage.getItem("token");

  const params = new URLSearchParams({
    language: language,
  });

  if (scale !== 1.0) {
    if (scale < 0.5 || scale > 2.0) {
      throw new Error("Scale must be between 0.5 and 2.0");
    }
    params.append("scale", scale.toString());
  }

  const res = await fetch(
    `/api/v1/contests/${contestId}/participants/${userId}/report/?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
        Accept: "*/*",
      },
    }
  );

  if (!res.ok) {
    try {
      const errorData = await res.json();
      const message =
        errorData.error?.message ||
        errorData.error ||
        errorData.message ||
        errorData.detail ||
        "Failed to download report";
      throw new Error(message);
    } catch {
      throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    }
  }

  // Download the file
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;

  // Extract filename from Content-Disposition header or use default
  const contentDisposition = res.headers.get("Content-Disposition");
  let filename = `report_${contestId}_${userId}.pdf`;
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?(.+)"?/);
    if (match) {
      filename = match[1].replace(/"/g, "");
    }
  }

  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};
