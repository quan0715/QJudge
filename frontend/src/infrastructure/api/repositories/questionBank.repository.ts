import { ensureOk, httpClient, requestJson } from "@/infrastructure/api/http.client";
import type {
  BankQuestion,
  ExploreBankItem,
  QuestionInboxSummary,
  QuestionBank,
} from "@/core/entities/question-bank.entity";
import type {
  CreateQuestionBankPayload,
  IQuestionBankRepository,
  UpsertBankQuestionPayload,
  UpdateQuestionBankPayload,
} from "@/core/ports/questionBank.repository";
import {
  mapBankQuestionDto,
  mapExploreBankItemDto,
  mapQuestionInboxItemDto,
  mapQuestionBankDto,
} from "@/infrastructure/mappers/questionBank.mapper";

const USE_MOCK = import.meta.env.VITE_QUESTION_BANK_USE_MOCK === "true";

const makeUuid = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const seed = `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 14)}`.slice(0, 12);
  return `00000000-0000-4000-8000-${seed.padEnd(12, "0")}`;
};

const getBankQuestionOperationId = (
  question: Pick<BankQuestion, "bankItemId">
): string => question.bankItemId;

type MockState = {
  mineBanks: QuestionBank[];
  exploreBanks: ExploreBankItem[];
  questionsByBank: Record<string, BankQuestion[]>;
};

const createMockState = (): MockState => ({
  mineBanks: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "我的程式題庫",
      description: "教學用與自建題目",
      icon: "code",
      coverUrl: "",
      category: "coding",
      visibility: "private",
      verified: false,
      reviewStatus: "draft",
      ownerUsername: "me",
      questionCount: 1,
    },
  ],
  exploreBanks: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "平台官方程式題庫",
      description: "目前僅平台提供 public 題庫",
      icon: "education",
      coverUrl: "",
      category: "coding",
      visibility: "public",
      verified: true,
      reviewStatus: "approved",
      ownerUsername: "platform",
      questionCount: 2,
      source: "platform",
    },
  ],
  questionsByBank: {
    "11111111-1111-4111-8111-111111111111": [
      {
        id: "33333333-3333-4333-8333-333333333331",
        bankItemId: "33333333-3333-4333-8333-333333333331",
        bankId: "11111111-1111-4111-8111-111111111111",
        questionType: "coding",
        title: "A + B",
        prompt: "計算兩數和",
        options: [],
        correctAnswer: null,
        score: 100,
        order: 0,
        difficulty: "easy",
        timeLimit: 1000,
        memoryLimit: 128,
      },
    ],
    "22222222-2222-4222-8222-222222222222": [
      {
        id: "33333333-3333-4333-8333-333333333332",
        bankItemId: "33333333-3333-4333-8333-333333333332",
        bankId: "22222222-2222-4222-8222-222222222222",
        questionType: "coding",
        title: "Two Sum",
        prompt: "Find pair sum.",
        options: [],
        correctAnswer: null,
        score: 100,
        order: 0,
        difficulty: "easy",
        timeLimit: 1000,
        memoryLimit: 128,
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        bankItemId: "33333333-3333-4333-8333-333333333333",
        bankId: "22222222-2222-4222-8222-222222222222",
        questionType: "coding",
        title: "Binary Search",
        prompt: "Implement binary search.",
        options: [],
        correctAnswer: null,
        score: 100,
        order: 1,
        difficulty: "medium",
        timeLimit: 1000,
        memoryLimit: 128,
      },
    ],
  },
});

const mockState = createMockState();

const toQuestionWriteDto = (payload: UpsertBankQuestionPayload) => {
  const dto: Record<string, unknown> = {
    question_type: payload.questionType,
    title: payload.title,
    prompt: payload.prompt ?? "",
    options: payload.options ?? [],
    correct_answer: payload.correctAnswer ?? null,
    metadata: payload.metadata ?? {},
    order: payload.order ?? 0,
    difficulty: payload.difficulty ?? "medium",
    time_limit: payload.timeLimit ?? 1000,
    memory_limit: payload.memoryLimit ?? 128,
    coding_ext: payload.codingExt
      ? {
          translations: payload.codingExt.translations ?? [],
          test_cases: payload.codingExt.testCases ?? [],
          language_configs: payload.codingExt.languageConfigs ?? [],
          forbidden_keywords: payload.codingExt.forbiddenKeywords ?? [],
          required_keywords: payload.codingExt.requiredKeywords ?? [],
        }
      : undefined,
  };

  // Score belongs to contest assignment semantics; bank writes should not force-bind it.
  if (typeof payload.score === "number") {
    dto.score = payload.score;
  }

  return dto;
};

const syncMockBankCount = (bankId: string): void => {
  const bank = mockState.mineBanks.find((row) => row.id === bankId);
  if (bank) {
    bank.questionCount = mockState.questionsByBank[bankId]?.length || 0;
  }
};

const findMockQuestion = (bankItemId: string) => {
  const entry = Object.entries(mockState.questionsByBank).find(([, questions]) =>
    questions.some((q) => getBankQuestionOperationId(q) === bankItemId)
  );
  if (!entry) return null;
  const [bankId, questions] = entry;
  const questionIndex = questions.findIndex((q) => getBankQuestionOperationId(q) === bankItemId);
  if (questionIndex < 0) return null;
  return { bankId, questionIndex, question: questions[questionIndex] };
};

const getBank = async (bankId: string): Promise<QuestionBank> => {
  const data = await requestJson<any>(
    httpClient.get(`/api/v1/question-banks/${bankId}/`),
    "Failed to fetch question bank"
  );
  return mapQuestionBankDto(data);
};

const listMine = async (): Promise<QuestionBank[]> => {
  if (USE_MOCK) {
    return [...mockState.mineBanks];
  }

  const data = await requestJson<any>(
    httpClient.get("/api/v1/question-banks/"),
    "Failed to fetch my question banks"
  );
  const rows = Array.isArray(data) ? data : data.results || [];
  return rows.map(mapQuestionBankDto);
};

const listExplore = async (): Promise<ExploreBankItem[]> => {
  if (USE_MOCK) {
    return [...mockState.exploreBanks];
  }

  const data = await requestJson<any>(
    httpClient.get("/api/v1/question-banks/explore/"),
    "Failed to fetch explore banks"
  );
  const rows = Array.isArray(data) ? data : data.results || [];
  return rows.map(mapExploreBankItemDto);
};

const create = async (
  payload: CreateQuestionBankPayload
): Promise<QuestionBank> => {
  if (USE_MOCK) {
    const next: QuestionBank = {
      id: makeUuid(),
      name: payload.name,
      description: payload.description || "",
      icon: "",
      coverUrl: "",
      category: payload.category,
      visibility: payload.visibility || "private",
      verified: Boolean(payload.verified),
      reviewStatus: "draft",
      questionCount: 0,
      ownerUsername: "me",
    };
    mockState.mineBanks.unshift(next);
    mockState.questionsByBank[next.id] = [];
    return next;
  }

  const data = await requestJson<any>(
    httpClient.post("/api/v1/question-banks/", payload),
    "Failed to create question bank"
  );
  return mapQuestionBankDto(data);
};

const update = async (
  id: string,
  payload: UpdateQuestionBankPayload
): Promise<QuestionBank> => {
  if (USE_MOCK) {
    const idx = mockState.mineBanks.findIndex((bank) => bank.id === id);
    if (idx === -1) throw new Error("Bank not found");
    mockState.mineBanks[idx] = {
      ...mockState.mineBanks[idx],
      ...payload,
    };
    return mockState.mineBanks[idx];
  }

  const data = await requestJson<any>(
    httpClient.patch(`/api/v1/question-banks/${id}/`, payload),
    "Failed to update question bank"
  );
  return mapQuestionBankDto(data);
};

const uploadCover = async (id: string, file: File): Promise<string> => {
  if (USE_MOCK) {
    const idx = mockState.mineBanks.findIndex((bank) => bank.id === id);
    if (idx === -1) throw new Error("Bank not found");
    const mockUrl = `https://example.com/mock-question-bank-cover/${id}.png`;
    mockState.mineBanks[idx] = {
      ...mockState.mineBanks[idx],
      coverUrl: mockUrl,
    };
    return mockUrl;
  }

  const formData = new FormData();
  formData.append("file", file);
  const data = await requestJson<{ cover_url: string }>(
    httpClient.request(`/api/v1/question-banks/${id}/upload_cover/`, {
      method: "POST",
      body: formData,
    }),
    "Failed to upload question bank cover"
  );
  return data.cover_url;
};

const submitForReview = async (id: string): Promise<QuestionBank> => {
  if (USE_MOCK) {
    const idx = mockState.mineBanks.findIndex((bank) => bank.id === id);
    if (idx === -1) throw new Error("Bank not found");
    mockState.mineBanks[idx] = {
      ...mockState.mineBanks[idx],
      reviewStatus: "pending",
      visibility: "public",
      verified: false,
    };
    return mockState.mineBanks[idx];
  }

  const data = await requestJson<any>(
    httpClient.post(`/api/v1/question-banks/${id}/submit-for-review/`, {}),
    "Failed to submit question bank for review"
  );
  return mapQuestionBankDto(data);
};

const review = async (
  id: string,
  payload: { decision: "approve" | "reject"; note?: string }
): Promise<QuestionBank> => {
  if (USE_MOCK) {
    const idx = mockState.mineBanks.findIndex((bank) => bank.id === id);
    if (idx === -1) throw new Error("Bank not found");
    mockState.mineBanks[idx] = {
      ...mockState.mineBanks[idx],
      reviewStatus: payload.decision === "approve" ? "approved" : "rejected",
      verified: payload.decision === "approve",
      visibility: "public",
      reviewNote: payload.note || "",
    };
    return mockState.mineBanks[idx];
  }

  const data = await requestJson<any>(
    httpClient.post(`/api/v1/question-banks/${id}/review/`, payload),
    "Failed to review question bank"
  );
  return mapQuestionBankDto(data);
};

const listReviewQueue = async (): Promise<QuestionBank[]> => {
  if (USE_MOCK) {
    return mockState.mineBanks.filter((bank) => bank.reviewStatus === "pending");
  }

  const data = await requestJson<any>(
    httpClient.get("/api/v1/question-banks/review-queue/"),
    "Failed to fetch review queue"
  );
  const rows = Array.isArray(data) ? data : data.results || [];
  return rows.map(mapQuestionBankDto);
};

const remove = async (id: string): Promise<void> => {
  if (USE_MOCK) {
    mockState.mineBanks = mockState.mineBanks.filter((bank) => bank.id !== id);
    delete mockState.questionsByBank[id];
    return;
  }

  await ensureOk(
    httpClient.delete(`/api/v1/question-banks/${id}/`),
    "Failed to delete question bank"
  );
};

const listQuestions = async (bankId: string): Promise<BankQuestion[]> => {
  if (USE_MOCK) {
    return [...(mockState.questionsByBank[bankId] || [])];
  }

  const data = await requestJson<any[]>(
    httpClient.get(`/api/v1/question-banks/${bankId}/questions/`),
    "Failed to fetch bank questions"
  );
  return Array.isArray(data) ? data.map(mapBankQuestionDto) : [];
};

const createQuestion = async (
  bankId: string,
  payload: UpsertBankQuestionPayload
): Promise<BankQuestion> => {
  if (USE_MOCK) {
    const nextId = makeUuid();
    const next: BankQuestion = {
      id: nextId,
      bankItemId: nextId,
      bankId,
      questionType: payload.questionType,
      title: payload.title,
      prompt: payload.prompt ?? "",
      options: payload.options ?? [],
      correctAnswer: payload.correctAnswer ?? null,
      metadata: payload.metadata ?? {},
      score: payload.score ?? 1,
      order: payload.order ?? (mockState.questionsByBank[bankId]?.length || 0),
      difficulty: payload.difficulty ?? "medium",
      timeLimit: payload.timeLimit ?? 1000,
      memoryLimit: payload.memoryLimit ?? 128,
    };
    if (!mockState.questionsByBank[bankId]) {
      mockState.questionsByBank[bankId] = [];
    }
    mockState.questionsByBank[bankId].push(next);
    syncMockBankCount(bankId);
    return next;
  }

  const data = await requestJson<any>(
    httpClient.post(`/api/v1/question-banks/${bankId}/questions/`, toQuestionWriteDto(payload)),
    "Failed to create question"
  );
  return mapBankQuestionDto(data);
};

const updateQuestion = async (
  bankItemId: string,
  payload: UpsertBankQuestionPayload
): Promise<BankQuestion> => {
  if (USE_MOCK) {
    const found = findMockQuestion(bankItemId);
    if (!found) {
      throw new Error("Question not found");
    }

    const current = found.question;
    const updated: BankQuestion = {
      ...current,
      questionType: payload.questionType,
      title: payload.title,
      prompt: payload.prompt ?? "",
      options: payload.options ?? [],
      correctAnswer: payload.correctAnswer ?? null,
      metadata: payload.metadata ?? current.metadata ?? {},
      score: payload.score ?? current.score ?? 1,
      order: payload.order ?? current.order,
      difficulty: payload.difficulty ?? "medium",
      timeLimit: payload.timeLimit ?? 1000,
      memoryLimit: payload.memoryLimit ?? 128,
    };
    mockState.questionsByBank[found.bankId][found.questionIndex] = updated;
    return updated;
  }

  const data = await requestJson<any>(
    httpClient.patch(`/api/v1/question-bank-items/${bankItemId}/`, toQuestionWriteDto(payload)),
    "Failed to update question"
  );
  return mapBankQuestionDto(data);
};

const removeQuestion = async (bankItemId: string): Promise<void> => {
  if (USE_MOCK) {
    const found = findMockQuestion(bankItemId);
    if (!found) return;
    mockState.questionsByBank[found.bankId] = mockState.questionsByBank[found.bankId].filter(
      (q) => getBankQuestionOperationId(q) !== bankItemId
    );
    syncMockBankCount(found.bankId);
    return;
  }

  await ensureOk(
    httpClient.delete(`/api/v1/question-bank-items/${bankItemId}/`),
    "Failed to delete question"
  );
};

const clone = async (
  bankItemId: string,
  targetBankId?: string
): Promise<BankQuestion> => {
  if (USE_MOCK) {
    const source = Object.values(mockState.questionsByBank)
      .flat()
      .find((q) => getBankQuestionOperationId(q) === bankItemId);

    if (!source) {
      throw new Error("Question not found");
    }

    const targetId = targetBankId || mockState.mineBanks[0]?.id;
    if (!targetId) {
      throw new Error("No target bank available");
    }

    const clonedId = makeUuid();
    const cloned: BankQuestion = {
      ...source,
      id: clonedId,
      bankItemId: clonedId,
      bankId: targetId,
      order: mockState.questionsByBank[targetId]?.length || 0,
    };

    if (!mockState.questionsByBank[targetId]) {
      mockState.questionsByBank[targetId] = [];
    }
    mockState.questionsByBank[targetId].push(cloned);

    const targetBank = mockState.mineBanks.find((bank) => bank.id === targetId);
    if (targetBank) {
      targetBank.questionCount = mockState.questionsByBank[targetId].length;
    }

    return cloned;
  }

  const data = await requestJson<any>(
    httpClient.post(
      `/api/v1/question-bank-items/${bankItemId}/clone-to-my-bank/`,
      targetBankId ? { target_bank_id: targetBankId } : {}
    ),
    "Failed to clone question"
  );
  return mapBankQuestionDto(data);
};

const listInbox = async (category?: "coding" | "exam"): Promise<QuestionInboxSummary> => {
  if (USE_MOCK) {
    return {
      coding: [],
      exam: [],
      counts: { coding: 0, exam: 0 },
    };
  }

  const query = category ? `?category=${encodeURIComponent(category)}` : "";
  const data = await requestJson<any>(
    httpClient.get(`/api/v1/question-banks/inbox/${query}`),
    "Failed to fetch question inbox"
  );

  const codingRows = Array.isArray(data?.coding) ? data.coding : [];
  const examRows = Array.isArray(data?.exam) ? data.exam : [];
  return {
    coding: codingRows.map(mapQuestionInboxItemDto),
    exam: examRows.map(mapQuestionInboxItemDto),
    counts: {
      coding: Number(data?.counts?.coding ?? codingRows.length),
      exam: Number(data?.counts?.exam ?? examRows.length),
    },
  };
};

const ingestInbox = async (params: {
  targetBankId: string;
  items: Array<{ sourceType: "problem" | "exam_question"; sourceId: string }>;
}): Promise<{
  targetBankId: string;
  requestedCount: number;
  ingestedCount: number;
  movedCount: number;
  questionIds: string[];
}> => {
  if (USE_MOCK) {
    return {
      targetBankId: params.targetBankId,
      requestedCount: params.items.length,
      ingestedCount: params.items.length,
      movedCount: 0,
      questionIds: [],
    };
  }

  const data = await requestJson<any>(
    httpClient.post("/api/v1/question-banks/inbox/ingest/", {
      target_bank_id: params.targetBankId,
      items: params.items.map((item) => ({
        source_type: item.sourceType,
        source_id: item.sourceId,
      })),
    }),
    "Failed to ingest question inbox items"
  );

  return {
    targetBankId: String(data.target_bank_id),
    requestedCount: Number(data.requested_count ?? 0),
    ingestedCount: Number(data.ingested_count ?? 0),
    movedCount: Number(data.moved_count ?? 0),
    questionIds: Array.isArray(data.question_ids)
      ? data.question_ids.map((row: unknown) => String(row))
      : [],
  };
};

export const questionBankRepository: IQuestionBankRepository = {
  getBank,
  listMine,
  listExplore,
  create,
  update,
  uploadCover,
  submitForReview,
  review,
  listReviewQueue,
  delete: remove,
  listQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion: removeQuestion,
  clone,
  listInbox,
  ingestInbox,
};

export {
  getBank,
  listMine,
  listExplore,
  create,
  update,
  uploadCover,
  submitForReview,
  review,
  listReviewQueue,
  remove as delete,
  listQuestions,
  createQuestion,
  updateQuestion,
  removeQuestion as deleteQuestion,
  clone,
  listInbox,
  ingestInbox,
};

export default questionBankRepository;
