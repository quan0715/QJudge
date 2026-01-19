import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";

export const getContestAdmins = async (
  contestId: string
): Promise<Array<{ id: string; username: string }>> => {
  return requestJson<Array<{ id: string; username: string }>>(
    httpClient.get(`/api/v1/contests/${contestId}/admins/`),
    "Failed to fetch admins"
  );
};

export const addContestAdmin = async (
  contestId: string,
  username: string
): Promise<{ id: string; username: string }> => {
  const data = await requestJson<any>(
    httpClient.post(`/api/v1/contests/${contestId}/add_admin/`, { username }),
    "Failed to add admin"
  );
  return data.user;
};

export const removeContestAdmin = async (
  contestId: string,
  userId: string
): Promise<void> => {
  await ensureOk(
    httpClient.post(`/api/v1/contests/${contestId}/remove_admin/`, {
      user_id: userId,
    }),
    "Failed to remove admin"
  );
};
