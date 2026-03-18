import type { ExamQuestion, ExamQuestionType } from "@/core/entities/contest.entity";
import type { BankQuestion, QuestionBank } from "@/core/entities/question-bank.entity";
import type { UpsertBankQuestionPayload } from "@/core/ports/questionBank.repository";
import type { ExamQuestionUpsertPayload } from "@/infrastructure/api/repositories/examQuestions.repository";
import { resolveExamQuestionTypeFromBankQuestion } from "@/shared/ui/questionVisual";

export interface QuestionFilterState {
  keyword: string;
  difficulty: string[];
  tags: string[];
  questionTypes: string[];
}

export interface QuestionPreviewMeta {
  providerName: string;
  downloadCount: number;
  isVerified: boolean;
  difficulty: string;
  tags: string[];
  passRate: number | null;
}

export interface ProblemManagementViewState {
  mode: "gallery" | "split";
  selectedId: string | null;
}

export const resolveExamQuestionType = (question: BankQuestion): ExamQuestionType => {
  return resolveExamQuestionTypeFromBankQuestion(question);
};

export const extractQuestionTags = (question: BankQuestion): string[] => {
  const metadata =
    question.metadata && typeof question.metadata === "object"
      ? (question.metadata as Record<string, unknown>)
      : {};
  const raw = metadata.tags;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
};

export const getQuestionTypeToken = (question: BankQuestion): string => {
  if (question.questionType === "coding") return "coding";
  return `exam:${resolveExamQuestionType(question)}`;
};

export const getQuestionTypeLabel = (token: string): string => {
  if (token === "coding") return "coding";
  if (!token.startsWith("exam:")) return token;
  return token.replace("exam:", "exam/");
};

const GENERATED_TITLE_PATTERN = /^(test|exam|question)\s*[-_ ]\s*q?\d+$/i;

const normalizePromptAsTitle = (prompt: string): string => {
  const text = prompt
    .replace(/[#*_`>\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 60);
};

export const getQuestionDisplayTitle = (question: Pick<BankQuestion, "title" | "prompt" | "questionType">): string => {
  const rawTitle = (question.title || "").trim();

  // Exam questions: always prefer prompt content as display title
  if (question.questionType === "exam") {
    const promptTitle = normalizePromptAsTitle(question.prompt || "");
    return promptTitle || rawTitle || "Untitled question";
  }

  // Coding questions: use title (it's meaningful, e.g. "A+B Problem")
  if (rawTitle && !GENERATED_TITLE_PATTERN.test(rawTitle)) {
    return rawTitle;
  }

  const promptTitle = normalizePromptAsTitle(question.prompt || "");
  return promptTitle || rawTitle || "Untitled question";
};

export const buildQuestionPreviewMeta = (
  question: BankQuestion,
  bank: QuestionBank
): QuestionPreviewMeta => {
  const metadata =
    question.metadata && typeof question.metadata === "object"
      ? (question.metadata as Record<string, unknown>)
      : {};
  const downloadCandidate =
    metadata.download_count ??
    metadata.downloads ??
    metadata.downloadCount ??
    (metadata.stats && typeof metadata.stats === "object"
      ? (metadata.stats as Record<string, unknown>).downloads
      : undefined);
  const parsed = Number(downloadCandidate);
  const difficultyCandidate =
    typeof metadata.difficulty === "string" && metadata.difficulty.trim().length > 0
      ? metadata.difficulty
      : question.difficulty || "medium";
  const normalizedDifficulty = difficultyCandidate.trim().toLowerCase();
  const passRateCandidate =
    metadata.pass_rate ??
    metadata.acceptance_rate ??
    metadata.ac_rate ??
    metadata.passRate ??
    (metadata.stats && typeof metadata.stats === "object"
      ? (metadata.stats as Record<string, unknown>).pass_rate ??
        (metadata.stats as Record<string, unknown>).acceptance_rate
      : undefined);
  const toPassRate = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) {
      const normalized = value <= 1 ? value * 100 : value;
      return Math.max(0, Math.min(100, normalized));
    }
    if (typeof value === "string") {
      const parsedValue = Number(value.replace("%", "").trim());
      if (Number.isFinite(parsedValue)) {
        const normalized = parsedValue <= 1 ? parsedValue * 100 : parsedValue;
        return Math.max(0, Math.min(100, normalized));
      }
    }
    return null;
  };
  return {
    providerName: bank.ownerUsername || "QJudge Community",
    downloadCount: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
    isVerified: Boolean(bank.verified),
    difficulty: normalizedDifficulty,
    tags: extractQuestionTags(question),
    passRate: toPassRate(passRateCandidate),
  };
};

export const filterQuestions = (
  questions: BankQuestion[],
  filterState: QuestionFilterState
): BankQuestion[] => {
  const keyword = filterState.keyword.trim().toLowerCase();
  return questions.filter((question) => {
    if (keyword) {
      const haystack = `${question.title} ${question.prompt || ""}`.toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }

    if (
      filterState.difficulty.length > 0 &&
      !filterState.difficulty.includes((question.difficulty || "medium").toLowerCase())
    ) {
      return false;
    }

    if (filterState.questionTypes.length > 0) {
      const token = getQuestionTypeToken(question);
      if (!filterState.questionTypes.includes(token)) return false;
    }

    if (filterState.tags.length > 0) {
      const tags = extractQuestionTags(question);
      if (!filterState.tags.some((tag) => tags.includes(tag))) return false;
    }

    return true;
  });
};

export const formatDownloadCount = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1000) {
    const rounded = (value / 1000).toFixed(1);
    return `${rounded.replace(".0", "")}k`;
  }
  return String(Math.floor(value));
};

export const toExamQuestion = (bankId: string, question: BankQuestion): ExamQuestion => ({
  id: question.id,
  contestId: bankId,
  questionType: resolveExamQuestionType(question),
  prompt: question.prompt || "",
  options: Array.isArray(question.options) ? question.options.map((item) => String(item)) : [],
  correctAnswer: question.correctAnswer,
  // Question bank does not expose scoring semantics; keep a safe internal placeholder.
  score: Number(question.score || 1),
  order: Number(question.order || 0),
  createdAt: question.createdAt || "",
  updatedAt: question.updatedAt || "",
});

const TRUE_FALSE_OPTIONS = ["True", "False"];

export const toExamBankPayload = (
  payload: ExamQuestionUpsertPayload,
  existing?: BankQuestion,
  forcedOrder?: number
): UpsertBankQuestionPayload => {
  const order = forcedOrder ?? payload.order ?? existing?.order ?? 0;
  const prompt = payload.prompt?.trim() || existing?.prompt || "New question";
  const existingMetadata =
    existing?.metadata && typeof existing.metadata === "object" ? existing.metadata : {};
  return {
    questionType: "exam",
    title: "",
    prompt,
    options: payload.question_type === "true_false" ? [...TRUE_FALSE_OPTIONS] : payload.options || [],
    correctAnswer: payload.correct_answer ?? null,
    // Bank question score is a transport placeholder. Real score is assigned in contest exam.
    score: Number(payload.score || existing?.score || 1),
    order,
    metadata: {
      ...existingMetadata,
      exam_question_type: payload.question_type,
    },
  };
};
