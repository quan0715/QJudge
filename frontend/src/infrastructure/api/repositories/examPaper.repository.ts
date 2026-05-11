import { httpClient, requestJson } from "@/infrastructure/api/http.client";
import type { ExamPaper } from "@/core/entities/contest.entity";
import type { ExamPaperDto } from "@/infrastructure/api/dto/contest.dto";
import { mapExamPaperDto } from "@/infrastructure/mappers/contest.mapper";

export const getExamPaper = async (contestId: string): Promise<ExamPaper> => {
  const data = await requestJson<ExamPaperDto>(
    httpClient.get(`/api/v1/contests/${contestId}/exam-paper/`),
    "Failed to fetch exam paper",
  );

  return mapExamPaperDto(data || {});
};
