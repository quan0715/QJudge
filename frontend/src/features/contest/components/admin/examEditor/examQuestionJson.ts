import type { ExamQuestion, ExamQuestionType } from "@/core/entities/contest.entity";

export const EXAM_QUESTION_JSON_VERSION = "qjudge.exam.v1" as const;

export type ExamQuestionJsonVersion = typeof EXAM_QUESTION_JSON_VERSION;

export interface ExamQuestionJsonQuestionV1 {
  question_type: ExamQuestionType;
  prompt: string;
  score: number;
  options?: string[];
  correct_answer?: unknown;
  order?: number;
}

export interface ExamQuestionJsonFileV1 {
  version: ExamQuestionJsonVersion;
  meta: {
    exported_at: string;
    contest_name: string;
  };
  questions: ExamQuestionJsonQuestionV1[];
}

export interface ExamQuestionJsonValidationError {
  field: string;
  message: string;
}

export interface ExamQuestionJsonNormalizedQuestion {
  question_type: ExamQuestionType;
  prompt: string;
  score: number;
  options?: string[];
  correct_answer?: unknown;
  order: number;
}

export interface ExamQuestionJsonParseResult {
  success: boolean;
  data?: {
    version: ExamQuestionJsonVersion;
    meta: {
      exported_at: string;
      contest_name: string;
    };
    questions: ExamQuestionJsonNormalizedQuestion[];
  };
  errors?: ExamQuestionJsonValidationError[];
}

type JsonObject = Record<string, unknown>;

const ROOT_KEYS = new Set(["version", "meta", "questions"]);
const META_KEYS = new Set(["exported_at", "contest_name"]);
const QUESTION_KEYS = new Set([
  "question_type",
  "prompt",
  "score",
  "options",
  "correct_answer",
  "order",
]);

const QUESTION_TYPES = new Set<ExamQuestionType>([
  "true_false",
  "single_choice",
  "multiple_choice",
  "short_answer",
  "essay",
]);

const TRUE_FALSE_OPTIONS = ["True", "False"];

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) return parsed;
  }
  return null;
}

function pushError(
  errors: ExamQuestionJsonValidationError[],
  field: string,
  message: string,
): void {
  errors.push({ field, message });
}

function validateUnknownKeys(
  obj: JsonObject,
  allowedKeys: Set<string>,
  basePath: string,
  errors: ExamQuestionJsonValidationError[],
): void {
  Object.keys(obj).forEach((key) => {
    if (!allowedKeys.has(key)) {
      pushError(errors, `${basePath}.${key}`, "Unknown field is not allowed");
    }
  });
}

function normalizeTrueFalseAnswer(value: unknown): number | null {
  if (value === 0 || value === "0" || value === true || value === "true") return 0;
  if (value === 1 || value === "1" || value === false || value === "false") return 1;
  return null;
}

function normalizePrimitiveToString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function normalizeOptions(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const options = value.map((item) => (typeof item === "string" ? item.trim() : ""));
  if (options.some((item) => item === "")) return null;
  return options;
}

function sanitizeQuestionForExport(
  question: ExamQuestion,
  normalizedOrder: number,
): ExamQuestionJsonQuestionV1 {
  const base: ExamQuestionJsonQuestionV1 = {
    question_type: question.questionType,
    prompt: question.prompt,
    score: question.score,
    order: normalizedOrder,
  };

  if (question.questionType === "true_false") {
    base.options = [...TRUE_FALSE_OPTIONS];
  } else if (
    question.questionType === "single_choice" ||
    question.questionType === "multiple_choice"
  ) {
    base.options = question.options.map((option) => option.trim());
  }

  if (question.correctAnswer !== undefined && question.correctAnswer !== null) {
    base.correct_answer = question.correctAnswer;
  }

  return base;
}

export function buildExamQuestionJsonV1(
  questions: ExamQuestion[],
  contestName: string,
): ExamQuestionJsonFileV1 {
  const sorted = [...questions].sort((a, b) => a.order - b.order);

  return {
    version: EXAM_QUESTION_JSON_VERSION,
    meta: {
      exported_at: new Date().toISOString(),
      contest_name: contestName,
    },
    questions: sorted.map((question, index) => sanitizeQuestionForExport(question, index)),
  };
}

export function stringifyExamQuestionJsonV1(
  questions: ExamQuestion[],
  contestName: string,
): string {
  return JSON.stringify(buildExamQuestionJsonV1(questions, contestName), null, 2);
}

export function parseExamQuestionJsonV1(content: string): ExamQuestionJsonParseResult {
  const errors: ExamQuestionJsonValidationError[] = [];
  let parsed: unknown;
  let metaExportedAt = "";
  let metaContestName = "";

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON format";
    return {
      success: false,
      errors: [{ field: "json", message }],
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      success: false,
      errors: [{ field: "root", message: "Root must be a JSON object" }],
    };
  }

  validateUnknownKeys(parsed, ROOT_KEYS, "root", errors);

  if (parsed.version !== EXAM_QUESTION_JSON_VERSION) {
    pushError(
      errors,
      "version",
      `version must be "${EXAM_QUESTION_JSON_VERSION}"`,
    );
  }

  if (!isPlainObject(parsed.meta)) {
    pushError(errors, "meta", "meta must be an object");
  } else {
    validateUnknownKeys(parsed.meta, META_KEYS, "meta", errors);
    if (typeof parsed.meta.exported_at !== "string" || parsed.meta.exported_at.trim() === "") {
      pushError(errors, "meta.exported_at", "exported_at must be a non-empty string");
    } else {
      metaExportedAt = parsed.meta.exported_at;
    }
    if (typeof parsed.meta.contest_name !== "string" || parsed.meta.contest_name.trim() === "") {
      pushError(errors, "meta.contest_name", "contest_name must be a non-empty string");
    } else {
      metaContestName = parsed.meta.contest_name;
    }
  }

  if (!Array.isArray(parsed.questions)) {
    pushError(errors, "questions", "questions must be an array");
  } else if (parsed.questions.length === 0) {
    pushError(errors, "questions", "questions must contain at least one item");
  }

  const normalizedQuestions: ExamQuestionJsonNormalizedQuestion[] = [];

  if (Array.isArray(parsed.questions)) {
    parsed.questions.forEach((rawQuestion, questionIndex) => {
      const basePath = `questions[${questionIndex}]`;
      if (!isPlainObject(rawQuestion)) {
        pushError(errors, basePath, "Question must be an object");
        return;
      }

      validateUnknownKeys(rawQuestion, QUESTION_KEYS, basePath, errors);

      const rawType = rawQuestion.question_type;
      if (typeof rawType !== "string" || !QUESTION_TYPES.has(rawType as ExamQuestionType)) {
        pushError(errors, `${basePath}.question_type`, "Invalid question_type");
        return;
      }

      const questionType = rawType as ExamQuestionType;

      if (typeof rawQuestion.prompt !== "string" || rawQuestion.prompt.trim() === "") {
        pushError(errors, `${basePath}.prompt`, "prompt must be a non-empty string");
      }

      if (typeof rawQuestion.score !== "number" || !Number.isFinite(rawQuestion.score) || rawQuestion.score <= 0) {
        pushError(errors, `${basePath}.score`, "score must be a number greater than 0");
      }

      if (rawQuestion.order !== undefined) {
        const order = toInteger(rawQuestion.order);
        if (order === null || order < 0) {
          pushError(errors, `${basePath}.order`, "order must be an integer >= 0");
        }
      }

      const normalized: ExamQuestionJsonNormalizedQuestion = {
        question_type: questionType,
        prompt: typeof rawQuestion.prompt === "string" ? rawQuestion.prompt.trim() : "",
        score: typeof rawQuestion.score === "number" ? rawQuestion.score : 0,
        order:
          rawQuestion.order === undefined
            ? questionIndex
            : Math.max(0, toInteger(rawQuestion.order) ?? questionIndex),
      };

      if (questionType === "true_false") {
        if (rawQuestion.options !== undefined) {
          const options = normalizeOptions(rawQuestion.options);
          if (!options || options.length !== 2 || options[0] !== "True" || options[1] !== "False") {
            pushError(
              errors,
              `${basePath}.options`,
              'true_false options must be ["True", "False"] when provided',
            );
          }
        }

        const answer = normalizeTrueFalseAnswer(rawQuestion.correct_answer);
        if (answer === null) {
          pushError(
            errors,
            `${basePath}.correct_answer`,
            'true_false correct_answer must be 0, 1, true, false, "true", or "false"',
          );
        } else {
          normalized.options = [...TRUE_FALSE_OPTIONS];
          normalized.correct_answer = answer;
        }
      }

      if (questionType === "single_choice") {
        const options = normalizeOptions(rawQuestion.options);
        if (!options || options.length < 2) {
          pushError(errors, `${basePath}.options`, "single_choice options must contain at least 2 strings");
        } else {
          normalized.options = options;
          const answer = toInteger(rawQuestion.correct_answer);
          if (answer === null || answer < 0 || answer >= options.length) {
            pushError(
              errors,
              `${basePath}.correct_answer`,
              "single_choice correct_answer must be a valid option index",
            );
          } else {
            normalized.correct_answer = answer;
          }
        }
      }

      if (questionType === "multiple_choice") {
        const options = normalizeOptions(rawQuestion.options);
        if (!options || options.length < 2) {
          pushError(errors, `${basePath}.options`, "multiple_choice options must contain at least 2 strings");
        } else {
          normalized.options = options;
          if (!Array.isArray(rawQuestion.correct_answer) || rawQuestion.correct_answer.length === 0) {
            pushError(
              errors,
              `${basePath}.correct_answer`,
              "multiple_choice correct_answer must be a non-empty array",
            );
          } else {
            const indexes = rawQuestion.correct_answer.map((item) => toInteger(item));
            if (indexes.some((item) => item === null)) {
              pushError(
                errors,
                `${basePath}.correct_answer`,
                "multiple_choice correct_answer must be an array of integers",
              );
            } else {
              const validIndexes = indexes as number[];
              const deduped = Array.from(new Set(validIndexes));
              const outOfRange = deduped.some((index) => index < 0 || index >= options.length);
              if (outOfRange || deduped.length === 0) {
                pushError(
                  errors,
                  `${basePath}.correct_answer`,
                  "multiple_choice correct_answer contains invalid option indexes",
                );
              } else {
                normalized.correct_answer = deduped;
              }
            }
          }
        }
      }

      if (questionType === "short_answer" || questionType === "essay") {
        if (rawQuestion.options !== undefined) {
          pushError(errors, `${basePath}.options`, `${questionType} does not support options`);
        }
        if (rawQuestion.correct_answer !== undefined) {
          const answer = normalizePrimitiveToString(rawQuestion.correct_answer);
          if (answer === null) {
            pushError(
              errors,
              `${basePath}.correct_answer`,
              `${questionType} correct_answer must be a string/number/boolean when provided`,
            );
          } else {
            normalized.correct_answer = answer;
          }
        }
      }

      normalizedQuestions.push(normalized);
    });
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  const normalizedAndReordered = [...normalizedQuestions]
    .sort((a, b) => a.order - b.order)
    .map((question, index) => ({
      ...question,
      order: index,
    }));

  return {
    success: true,
    data: {
      version: EXAM_QUESTION_JSON_VERSION,
      meta: {
        exported_at: metaExportedAt,
        contest_name: metaContestName,
      },
      questions: normalizedAndReordered,
    },
  };
}

export function buildExamQuestionImportPromptTemplate(contestName: string): string {
  return [
    "你是一位資深命題老師，請先用條列說明你的出題設計思路，再提供可直接匯入 QJudge 的 JSON。",
    "",
    "輸出要求：",
    "1) 回覆先有「說明段落」（JSON 前），再提供一個完整 JSON code block。",
    "2) JSON 必須是單一 object，且嚴格符合 qjudge.exam.v1：",
    '   - root keys: version, meta, questions（不可有其他欄位）',
    '   - version 必須是 "qjudge.exam.v1"',
    "   - meta 需包含 exported_at(ISO8601 string) 與 contest_name",
    "   - questions 為陣列，至少 1 題",
    "3) 題型只允許：true_false, single_choice, multiple_choice, short_answer, essay",
    "4) score 必須 > 0",
    '5) true_false: options 必須為 ["True","False"]（或省略由系統補），correct_answer 可用 0/1/true/false/"true"/"false"',
    "6) single_choice: options 至少 2 個，correct_answer 為有效索引整數",
    "7) multiple_choice: options 至少 2 個，correct_answer 為非空整數索引陣列",
    "8) short_answer / essay: 不要提供 options；correct_answer 可省略或為字串",
    "9) 盡量提供清楚 prompt，必要時可用 Markdown。",
    "",
    "請產生：",
    `- contest_name: ${contestName || "Untitled Contest"}`,
    "- 題數：8 題",
    "- 難度：中等",
    "- 題型分布：single_choice 3、multiple_choice 2、true_false 1、short_answer 1、essay 1",
    "",
    "請務必提供最終 JSON（可直接貼回匯入）：",
    "```json",
    "{",
    '  "version": "qjudge.exam.v1",',
    '  "meta": {',
    '    "exported_at": "2026-04-04T00:00:00.000Z",',
    `    "contest_name": "${contestName || "Untitled Contest"}"`,
    "  },",
    '  "questions": [',
    "    ...",
    "  ]",
    "}",
    "```",
  ].join("\n");
}
