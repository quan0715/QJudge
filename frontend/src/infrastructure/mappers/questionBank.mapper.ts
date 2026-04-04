import type {
  QuestionBank,
  BankQuestion,
  QuestionInboxItem,
  QuestionInboxSummary,
  CodingQuestionExt,
} from "@/core/entities/question-bank.entity";
import type {
  QuestionBankDto,
  BankQuestionDto,
  QuestionInboxItemDto,
  QuestionInboxSummaryDto,
  CodingQuestionExtDto,
} from "@/infrastructure/api/dto/question-bank.dto";

export function mapQuestionBankDto(dto: QuestionBankDto): QuestionBank {
  return {
    id: dto.id.toString(),
    name: dto.name,
    description: dto.description || "",
    icon: dto.icon || "",
    coverUrl: dto.cover_url || "",
    category: dto.category,
    visibility: dto.visibility,
    verified: !!dto.verified,
    reviewStatus: dto.review_status,
    reviewNote: dto.review_note,
    submittedAt: dto.submitted_at,
    reviewedAt: dto.reviewed_at,
    reviewedByUsername: dto.reviewed_by_username,
    ownerUsername: dto.owner_username,
    questionCount: dto.question_count || 0,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

function mapCodingExtDto(dto?: CodingQuestionExtDto): CodingQuestionExt | undefined {
  if (!dto) return undefined;
  return {
    translations: (dto.translations || []).map((t) => ({
      language: t.language,
      title: t.title,
      description: t.description,
      inputDescription: t.input_description,
      outputDescription: t.output_description,
      hint: t.hint,
    })),
    testCases: (dto.test_cases || []).map((tc) => ({
      inputData: tc.input_data,
      outputData: tc.output_data,
      isSample: tc.is_sample,
      score: tc.score,
      order: tc.order,
      isHidden: tc.is_hidden,
    })),
    languageConfigs: (dto.language_configs || []).map((lc) => ({
      language: lc.language,
      templateCode: lc.template_code,
      isEnabled: lc.is_enabled,
      order: lc.order,
    })),
    forbiddenKeywords: dto.forbidden_keywords || [],
    requiredKeywords: dto.required_keywords || [],
  };
}

export function mapBankQuestionDto(dto: BankQuestionDto): BankQuestion {
  return {
    id: dto.id.toString(),
    bankItemId: (dto.bank_item_id || dto.id).toString(),
    adapterQuestionId: dto.adapter_question_id?.toString() ?? null,
    bankId: (dto.bank_id || dto.bank || "").toString(),
    questionType: dto.question_type,
    title: dto.title,
    prompt: dto.prompt || "",
    options: dto.options || [],
    correctAnswer: dto.correct_answer,
    score: dto.score || 0,
    order: dto.order || 0,
    difficulty: dto.difficulty || "medium",
    timeLimit: dto.time_limit || 2000,
    memoryLimit: dto.memory_limit || 256,
    metadata: dto.metadata || {},
    sourceQuestionId: dto.source_question_id?.toString() ?? null,
    sourceBankId: dto.source_bank_id?.toString() ?? null,
    sourceBankName: dto.source_bank_name || null,
    contestUsages: (dto.contest_usages || []).map((u) => ({
      contestId: u.contest_id.toString(),
      contestName: u.contest_name,
    })),
    codingExt: mapCodingExtDto(dto.coding_ext),
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

export function mapQuestionInboxItemDto(dto: QuestionInboxItemDto): QuestionInboxItem {
  return {
    sourceType: dto.source_type,
    sourceId: dto.source_id.toString(),
    title: dto.title,
    contestId: dto.contest_id?.toString(),
    contestName: dto.contest_name,
    questionType: dto.question_type,
    score: dto.score,
    updatedAt: dto.updated_at,
  };
}

export function mapQuestionInboxSummaryDto(dto: QuestionInboxSummaryDto): QuestionInboxSummary {
  return {
    coding: (dto.coding || []).map(mapQuestionInboxItemDto),
    exam: (dto.exam || []).map(mapQuestionInboxItemDto),
    counts: dto.counts || { coding: 0, exam: 0 },
  };
}
