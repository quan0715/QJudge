import { ensureOk, httpClient, requestJson } from "@/infrastructure/api/http.client";
import type {
  ExamPaper,
  ExamPaperBlock,
  ExamQuestionAnswerFormat,
  ExamQuestionType,
  OpenAnswerDocument,
} from "@/core/entities/contest.entity";
import type { ExamPaperBlockDto, ExamPaperDto } from "@/infrastructure/api/dto/contest.dto";
import { mapExamPaperBlockDto, mapExamPaperDto } from "@/infrastructure/mappers/contest.mapper";

export interface ExamPaperQuestionPayload {
  id?: string;
  question_type?: ExamQuestionType;
  prompt?: string;
  options?: string[];
  correct_answer?: unknown;
  reference_answer_document?: OpenAnswerDocument | null;
  explanation?: string;
  explanation_document?: OpenAnswerDocument | null;
  score?: number;
  order?: number;
  answer_format?: ExamQuestionAnswerFormat;
}

export interface ExamPaperGroupPayload {
  title?: string;
  shared_stem_markdown?: string;
  order?: number;
}

export type ExamPaperBlockCreatePayload =
  | {
      kind: "question";
      question: ExamPaperQuestionPayload & {
        question_type: ExamQuestionType;
        prompt: string;
        score: number;
      };
    }
  | {
      kind: "group";
      group: ExamPaperGroupPayload;
      children?: ExamPaperQuestionPayload[];
    };

export type ExamPaperBlockUpdatePayload =
  | {
      kind: "question";
      question: Partial<ExamPaperQuestionPayload>;
    }
  | {
      kind: "group";
      group?: ExamPaperGroupPayload;
      children?: ExamPaperQuestionPayload[];
    };

export const getExamPaper = async (contestId: string): Promise<ExamPaper> => {
  const data = await requestJson<ExamPaperDto>(
    httpClient.get(`/api/v1/contests/${contestId}/exam-paper/`),
    "Failed to fetch exam paper",
  );

  return mapExamPaperDto(data || {});
};

export const createExamPaperBlock = async (
  contestId: string,
  payload: ExamPaperBlockCreatePayload,
): Promise<ExamPaperBlock> => {
  const data = await requestJson<ExamPaperBlockDto>(
    httpClient.post(`/api/v1/contests/${contestId}/exam-paper/`, payload),
    "Failed to create exam paper block",
  );
  const block = mapExamPaperBlockDto(data);
  if (!block) throw new Error("Failed to create exam paper block");
  return block;
};

export const updateExamPaperBlock = async (
  contestId: string,
  blockId: string,
  payload: ExamPaperBlockUpdatePayload,
): Promise<ExamPaperBlock> => {
  const data = await requestJson<ExamPaperBlockDto>(
    httpClient.patch(`/api/v1/contests/${contestId}/exam-paper/${blockId}/`, payload),
    "Failed to update exam paper block",
  );
  const block = mapExamPaperBlockDto(data);
  if (!block) throw new Error("Failed to update exam paper block");
  return block;
};

export const deleteExamPaperBlock = async (
  contestId: string,
  blockId: string,
): Promise<void> => {
  await ensureOk(
    httpClient.delete(`/api/v1/contests/${contestId}/exam-paper/${blockId}/`),
    "Failed to delete exam paper block",
  );
};

export const reorderExamPaperBlocks = async (
  contestId: string,
  blocks: Array<{ kind: ExamPaperBlock["kind"]; id: string }>,
): Promise<ExamPaper> => {
  const data = await requestJson<ExamPaperDto>(
    httpClient.patch(`/api/v1/contests/${contestId}/exam-paper/`, { blocks }),
    "Failed to reorder exam paper blocks",
  );

  return mapExamPaperDto(data || {});
};
