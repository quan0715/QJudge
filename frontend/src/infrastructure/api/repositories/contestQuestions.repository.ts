import { httpClient, requestJson } from "@/infrastructure/api/http.client";
import type { ContestQuestion } from "@/core/entities/contest.entity";
import { mapContestQuestionDto } from "@/infrastructure/mappers/contest.mapper";

export const getContestQuestions = async (
  contestId: string
): Promise<ContestQuestion[]> => {
  const data = await requestJson<any>(
    httpClient.get(`/api/v1/contests/${contestId}/questions/`),
    "Failed to fetch questions"
  );
  return Array.isArray(data) ? data.map(mapContestQuestionDto) : [];
};

export const createContestQuestion = async (
  contestId: string,
  data: { title: string; content: string }
): Promise<ContestQuestion> => {
  const responseData = await requestJson<any>(
    httpClient.post(`/api/v1/contests/${contestId}/questions/`, data),
    "Failed to post question"
  );
  return mapContestQuestionDto(responseData);
};

export const answerContestQuestion = async (
  contestId: string,
  questionId: string,
  answer: string
): Promise<ContestQuestion> => {
  const responseData = await requestJson<any>(
    httpClient.post(
      `/api/v1/contests/${contestId}/questions/${questionId}/answer/`,
      { answer }
    ),
    "Failed to answer question"
  );
  return mapContestQuestionDto(responseData);
};
