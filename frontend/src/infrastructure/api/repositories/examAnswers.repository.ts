import { httpClient, requestJson } from "@/infrastructure/api/http.client";

// ── Types ──

export interface ExamAnswerDto {
  id: number;
  question_id: number;
  answer: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface QuestionSnapshotDto {
  prompt: string;
  options: string[];
  correct_answer: unknown;
  question_type: string;
  score: number;
}

export interface ExamAnswerDetailDto extends ExamAnswerDto {
  is_correct: boolean | null;
  score: string | null;
  feedback: string;
  graded_by_username: string | null;
  graded_at: string | null;
  question_prompt?: string;
  question_type?: string;
  question_options?: string[];
  max_score?: string | number | null;
  question_snapshot?: QuestionSnapshotDto | null;
  participant_user_id?: number;
  participant_username?: string;
  participant_nickname?: string;
}

export interface ExamAnswer {
  id: string;
  questionId: string;
  answer: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionSnapshot {
  prompt: string;
  options: string[];
  correctAnswer: unknown;
  questionType: string;
  score: number;
}

export interface ExamAnswerDetail extends ExamAnswer {
  isCorrect: boolean | null;
  score: number | null;
  feedback: string;
  gradedByUsername: string | null;
  gradedAt: string | null;
  questionPrompt?: string;
  questionType?: string;
  questionOptions?: string[];
  maxScore?: number | null;
  questionSnapshot?: QuestionSnapshot | null;
  participantUserId?: string;
  participantUsername?: string;
  participantNickname?: string;
}

// ── Mappers ──

const mapAnswerDto = (dto: ExamAnswerDto): ExamAnswer => ({
  id: String(dto.id),
  questionId: String(dto.question_id),
  answer: dto.answer,
  createdAt: dto.created_at,
  updatedAt: dto.updated_at,
});

const mapAnswerDetailDto = (dto: ExamAnswerDetailDto): ExamAnswerDetail => ({
  ...mapAnswerDto(dto),
  isCorrect: dto.is_correct,
  score: dto.score != null ? Number(dto.score) : null,
  feedback: dto.feedback ?? "",
  gradedByUsername: dto.graded_by_username,
  gradedAt: dto.graded_at,
  questionPrompt: dto.question_prompt,
  questionType: dto.question_type,
  questionOptions: dto.question_options,
  maxScore: dto.max_score != null ? Number(dto.max_score) : null,
  questionSnapshot: dto.question_snapshot
    ? {
        prompt: dto.question_snapshot.prompt,
        options: dto.question_snapshot.options ?? [],
        correctAnswer: dto.question_snapshot.correct_answer,
        questionType: dto.question_snapshot.question_type,
        score: dto.question_snapshot.score,
      }
    : null,
  participantUserId: dto.participant_user_id != null ? String(dto.participant_user_id) : undefined,
  participantUsername: dto.participant_username,
  participantNickname: dto.participant_nickname,
});

// ── Student API ──

/** Submit or update a single answer (auto-save). */
export const submitExamAnswer = async (
  contestId: string,
  questionId: string,
  answer: Record<string, unknown>
): Promise<ExamAnswer> => {
  const dto = await requestJson<ExamAnswerDto>(
    httpClient.post(`/api/v1/contests/${contestId}/exam-answers/submit/`, {
      question_id: Number(questionId),
      answer,
    }),
    "Failed to save answer"
  );
  return mapAnswerDto(dto);
};

/** Get all answers for the current student. */
export const getMyExamAnswers = async (
  contestId: string
): Promise<ExamAnswer[]> => {
  const data = await requestJson<ExamAnswerDto[]>(
    httpClient.get(`/api/v1/contests/${contestId}/exam-answers/my-answers/`),
    "Failed to fetch answers"
  );
  return data.map(mapAnswerDto);
};

/** Get graded results (requires results_published). */
export const getExamResults = async (
  contestId: string
): Promise<ExamAnswerDetail[]> => {
  const data = await requestJson<ExamAnswerDetailDto[]>(
    httpClient.get(`/api/v1/contests/${contestId}/exam-answers/results/`),
    "Failed to fetch results"
  );
  return data.map(mapAnswerDetailDto);
};

// ── TA/Admin API ──

/** Get all answers for all students (TA only). Filter by user_id. */
export const getAllExamAnswers = async (
  contestId: string,
  userId?: string
): Promise<ExamAnswerDetail[]> => {
  const params = userId ? `?user_id=${userId}` : "";
  const data = await requestJson<ExamAnswerDetailDto[]>(
    httpClient.get(
      `/api/v1/contests/${contestId}/exam-answers/all-answers/${params}`
    ),
    "Failed to fetch all answers"
  );
  return data.map(mapAnswerDetailDto);
};

/** Grade a single answer (TA only). */
export const gradeExamAnswer = async (
  contestId: string,
  answerId: string,
  payload: { score: number; feedback?: string }
): Promise<ExamAnswerDetail> => {
  const dto = await requestJson<ExamAnswerDetailDto>(
    httpClient.post(
      `/api/v1/contests/${contestId}/exam-answers/${answerId}/grade/`,
      payload
    ),
    "Failed to grade answer"
  );
  return mapAnswerDetailDto(dto);
};
