import { httpClient, requestJson, ensureOk } from "@/infrastructure/api/http.client";

export const getClarifications = async (
  contestId: string
): Promise<any[]> => {
  return requestJson<any[]>(
    httpClient.get(`/api/v1/contests/${contestId}/clarifications/`),
    "Failed to fetch clarifications"
  );
};

export const createClarification = async (
  contestId: string,
  data: {
    question: string;
    problem_id?: string;
  }
): Promise<any> => {
  return requestJson<any>(
    httpClient.post(`/api/v1/contests/${contestId}/clarifications/`, data),
    "Failed to create clarification"
  );
};

export const replyClarification = async (
  contestId: string,
  clarificationId: string,
  answer: string,
  isPublic: boolean
): Promise<any> => {
  return requestJson<any>(
    httpClient.post(
      `/api/v1/contests/${contestId}/clarifications/${clarificationId}/reply/`,
      { answer, is_public: isPublic }
    ),
    "Failed to reply to clarification"
  );
};

export const deleteClarification = async (
  contestId: string,
  clarificationId: string
): Promise<void> => {
  await ensureOk(
    httpClient.delete(
      `/api/v1/contests/${contestId}/clarifications/${clarificationId}/`
    ),
    "Failed to delete clarification"
  );
};
