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

// ── Exam Answer Draft (localStorage backup) ──────────────────────────────────
// Persists each answer locally before the network call.  If the server is
// temporarily unavailable, the draft survives a page reload and auto-save will
// retry on the next keystroke.

const DRAFT_PREFIX = "qjudge.exam.draft";

export const saveExamAnswerDraft = (
  contestId: string,
  questionId: string,
  answer: Record<string, unknown>
): void => {
  try {
    localStorage.setItem(
      `${DRAFT_PREFIX}.${contestId}.${questionId}`,
      JSON.stringify({ answer, ts: Date.now() })
    );
  } catch {
    // localStorage may be unavailable (private browsing quota exceeded, etc.)
  }
};

export const getExamAnswerDraft = (
  contestId: string,
  questionId: string
): Record<string, unknown> | null => {
  try {
    const raw = localStorage.getItem(
      `${DRAFT_PREFIX}.${contestId}.${questionId}`
    );
    if (!raw) return null;
    return (JSON.parse(raw) as { answer: Record<string, unknown> }).answer;
  } catch {
    return null;
  }
};

export const clearExamAnswerDraft = (
  contestId: string,
  questionId: string
): void => {
  try {
    localStorage.removeItem(`${DRAFT_PREFIX}.${contestId}.${questionId}`);
  } catch {}
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Submit or update a single answer (auto-save) with retry on server errors. */
export const submitExamAnswer = async (
  contestId: string,
  questionId: string,
  answer: Record<string, unknown>
): Promise<ExamAnswer> => {
  // Persist locally before hitting the network so no answer is lost on 5xx.
  saveExamAnswerDraft(contestId, questionId, answer);

  const MAX_ATTEMPTS = 3;
  let lastError: Error = new Error("Failed to save answer");

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await httpClient.post(
        `/api/v1/contests/${contestId}/exam-answers/submit/`,
        { question_id: Number(questionId), answer }
      );

      if (response.ok) {
        const dto = (await response.json()) as ExamAnswerDto;
        // Answer is safely stored on the server – remove the local draft.
        clearExamAnswerDraft(contestId, questionId);
        return mapAnswerDto(dto);
      }

      // Only retry on transient server errors (5xx).
      if (response.status < 500 || attempt === MAX_ATTEMPTS) {
        const text = await response.text().catch(() => "");
        let msg = "Failed to save answer";
        try {
          const data = JSON.parse(text);
          msg =
            data?.detail || data?.message || data?.error || msg;
        } catch {}
        throw new Error(msg);
      }
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) {
        lastError = err instanceof Error ? err : new Error(String(err));
        break;
      }
    }

    // Exponential back-off: 300 ms, 600 ms between retries.
    await sleep(300 * attempt);
  }

  throw lastError;
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
