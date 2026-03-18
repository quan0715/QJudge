import type {
  BankQuestion,
  CodingQuestionExt,
  ExploreBankItem,
  QuestionInboxItem,
  QuestionBank,
} from "@/core/entities/question-bank.entity";

const toStringId = (value: unknown): string => String(value ?? "");

const mapCodingExtDto = (dto: any): CodingQuestionExt => ({
  translations: Array.isArray(dto?.translations)
    ? dto.translations.map((item: any) => ({
        language: item.language,
        title: item.title,
        description: item.description,
        inputDescription: item.input_description,
        outputDescription: item.output_description,
        hint: item.hint,
      }))
    : [],
  testCases: Array.isArray(dto?.test_cases)
    ? dto.test_cases.map((item: any) => ({
        inputData: item.input_data,
        outputData: item.output_data,
        isSample: Boolean(item.is_sample),
        score: item.score,
        order: item.order,
        isHidden: Boolean(item.is_hidden),
      }))
    : [],
  languageConfigs: Array.isArray(dto?.language_configs)
    ? dto.language_configs.map((item: any) => ({
        language: item.language,
        templateCode: item.template_code,
        isEnabled: item.is_enabled,
        order: item.order,
      }))
    : [],
  forbiddenKeywords: Array.isArray(dto?.forbidden_keywords)
    ? dto.forbidden_keywords
    : [],
  requiredKeywords: Array.isArray(dto?.required_keywords)
    ? dto.required_keywords
    : [],
});

export const mapQuestionBankDto = (dto: any): QuestionBank => ({
  id: toStringId(dto.id),
  name: dto.name,
  description: dto.description || "",
  category: dto.category,
  visibility: dto.visibility,
  verified: Boolean(dto.verified),
  ownerUsername: dto.owner_username,
  questionCount: Number(dto.question_count || 0),
  createdAt: dto.created_at,
  updatedAt: dto.updated_at,
});

export const mapExploreBankItemDto = (dto: any): ExploreBankItem => ({
  ...mapQuestionBankDto(dto),
  source: "platform",
});

export const mapBankQuestionDto = (dto: any): BankQuestion => ({
  id: toStringId(dto.id),
  bankId: toStringId(dto.bank),
  questionType: dto.question_type,
  title: dto.title,
  prompt: dto.prompt || "",
  options: Array.isArray(dto.options) ? dto.options : [],
  correctAnswer: dto.correct_answer,
  score: Number(dto.score || 0),
  order: Number(dto.order || 0),
  difficulty: dto.difficulty || "medium",
  timeLimit: Number(dto.time_limit || 1000),
  memoryLimit: Number(dto.memory_limit || 128),
  metadata: dto.metadata && typeof dto.metadata === "object" ? dto.metadata : undefined,
  sourceQuestionId: dto.source_question_id ?? null,
  sourceBankId: dto.source_bank_id ?? null,
  sourceBankName: dto.source_bank_name ?? null,
  codingExt: dto.coding_ext ? mapCodingExtDto(dto.coding_ext) : undefined,
  createdAt: dto.created_at,
  updatedAt: dto.updated_at,
});

export const mapQuestionInboxItemDto = (dto: any): QuestionInboxItem => ({
  sourceType: dto.source_type,
  sourceId: Number(dto.source_id),
  title: dto.title || "",
  contestId: dto.contest_id ? Number(dto.contest_id) : undefined,
  contestName: dto.contest_name || undefined,
  questionType: dto.question_type || undefined,
  score: typeof dto.score === "number" ? dto.score : undefined,
  updatedAt: dto.updated_at,
});
