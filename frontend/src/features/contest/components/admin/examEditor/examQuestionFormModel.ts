import {
  DEFAULT_CHOICE_OPTIONS,
  DEFAULT_QUESTION_PROMPT,
} from "@/features/contest/domain/examPublishIssues";
import type {
  ExamQuestion,
  ExamQuestionAnswerFormat,
  ExamQuestionType,
} from "@/core/entities/contest.entity";
import type {
  ExamQuestionUpsertPayload,
  ExamPaperQuestionPayload,
} from "@/infrastructure/api/repositories";
import type { LockedQuestionComparableState } from "./lockedQuestionSaveImpact";

export const TRUE_FALSE_OPTIONS = ["True", "False"];
export const ALLOWED_TYPE_SWITCHES: Record<
  ExamQuestionType,
  ExamQuestionType[]
> = {
  single_choice: ["single_choice", "multiple_choice"],
  multiple_choice: ["multiple_choice", "single_choice"],
  short_answer: ["short_answer", "essay"],
  essay: ["essay", "short_answer"],
  true_false: ["true_false"],
};

// --- Form types & helpers ---

export interface QuestionFormState extends LockedQuestionComparableState {
  prompt: string;
  options: string[];
  answerFormat: ExamQuestionAnswerFormat;
}

export const getDefaultOptions = (type: ExamQuestionType): string[] => {
  if (type === "true_false") return [...TRUE_FALSE_OPTIONS];
  if (type === "essay" || type === "short_answer") return [];
  return ["", ""];
};

export const isChoiceType = (type: ExamQuestionType) =>
  type === "true_false" ||
  type === "single_choice" ||
  type === "multiple_choice";

export const isSubjectiveType = (type: ExamQuestionType) =>
  type === "short_answer" || type === "essay";

/**
 * Stored objective answers only count when they are the 0-based option
 * indexes students submit; anything else grades every answer wrong, so it is
 * shown as unset and the teacher has to pick the answer again.
 */
const isAnswerIndex = (value: unknown, size: number): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value < size;

const toAnswerIndex = (
  value: unknown,
  options: string[],
  questionType: ExamQuestionType,
): number | null => {
  const size = questionType === "true_false" ? 2 : options.length;
  return isAnswerIndex(value, size) ? value : null;
};

const toAnswerIndexes = (value: unknown, options: string[]): number[] => {
  if (!Array.isArray(value)) return [];
  return new Set(value).size === value.length &&
    value.every((item) => isAnswerIndex(item, options.length))
    ? (value as number[])
    : [];
};

export const toFormState = (question: ExamQuestion): QuestionFormState => {
  const options = question.options || [];
  const base: QuestionFormState = {
    questionType: question.questionType,
    prompt: question.prompt,
    explanation: question.explanation || "",
    score: String(question.score || 0),
    options: [],
    singleAnswerIndex: "",
    multiAnswerIndexes: [],
    essayReferenceAnswer: "",
    shortAnswer: "",
    answerFormat: question.answerFormat ?? "plain_text",
    referenceAnswerDocument: question.referenceAnswerDocument ?? null,
    explanationDocument: question.explanationDocument ?? null,
  };

  if (question.questionType === "multiple_choice") {
    return {
      ...base,
      options,
      multiAnswerIndexes: toAnswerIndexes(question.correctAnswer, options).map(
        String,
      ),
    };
  }
  if (question.questionType === "short_answer") {
    const answer = question.correctAnswer;
    return {
      ...base,
      shortAnswer:
        answer == null
          ? ""
          : typeof answer === "string"
            ? answer
            : String(answer),
    };
  }
  if (question.questionType === "essay") {
    return {
      ...base,
      essayReferenceAnswer:
        typeof question.correctAnswer === "string"
          ? question.correctAnswer
          : question.correctAnswer == null
            ? ""
            : JSON.stringify(question.correctAnswer),
    };
  }
  const resolvedOptions =
    question.questionType === "true_false"
      ? options.length >= 2
        ? options.slice(0, 2)
        : [...TRUE_FALSE_OPTIONS]
      : options;
  return {
    ...base,
    options: resolvedOptions,
    singleAnswerIndex: String(
      toAnswerIndex(
        question.correctAnswer,
        resolvedOptions,
        question.questionType,
      ) ?? "",
    ),
  };
};

export const buildPayload = (
  form: QuestionFormState,
  includeScore = true,
): ExamQuestionUpsertPayload => {
  const payload: ExamQuestionUpsertPayload = {
    question_type: form.questionType,
    prompt: form.prompt.trim(),
    explanation:
      form.answerFormat === "open_document" ? "" : form.explanation.trim(),
    score: includeScore ? Number(form.score || 0) : 1,
    answer_format: isChoiceType(form.questionType)
      ? "plain_text"
      : form.answerFormat,
  };
  if (
    isSubjectiveType(form.questionType) &&
    form.answerFormat === "open_document"
  ) {
    payload.correct_answer = null;
    payload.reference_answer_document = form.referenceAnswerDocument;
    payload.explanation_document = form.explanationDocument;
    return payload;
  }
  if (form.questionType === "essay") {
    if (form.essayReferenceAnswer.trim()) {
      payload.correct_answer = form.essayReferenceAnswer.trim();
    }
    return payload;
  }
  if (form.questionType === "short_answer") {
    if (form.shortAnswer.trim()) {
      payload.correct_answer = form.shortAnswer.trim();
    }
    return payload;
  }
  if (form.questionType === "true_false") {
    payload.options = form.options.map((o) => o.trim());
    if (form.singleAnswerIndex !== "") {
      payload.correct_answer = Number(form.singleAnswerIndex);
    }
    return payload;
  }
  const options = form.options.map((o) => o.trim());
  payload.options = options;
  if (form.questionType === "multiple_choice") {
    payload.correct_answer = form.multiAnswerIndexes.length
      ? form.multiAnswerIndexes.map(Number)
      : null;
    return payload;
  }
  if (form.singleAnswerIndex !== "") {
    payload.correct_answer = Number(form.singleAnswerIndex);
  }
  return payload;
};

/**
 * A locked question only accepts grading fields. Content fields are dropped so
 * values the form filled in for display (e.g. default true/false options) are
 * not sent back as content edits.
 */
export const toLockedGradingPayload = (
  payload: ExamQuestionUpsertPayload,
): Partial<ExamQuestionUpsertPayload> => {
  const {
    question_type: _questionType,
    prompt: _prompt,
    options: _options,
    answer_format: _answerFormat,
    ...grading
  } = payload;
  return grading;
};

/** Deep-compare two form states to detect dirty */
export const isFormDirty = (
  a: QuestionFormState,
  b: QuestionFormState,
  includeScore = true,
): boolean => {
  if (a.questionType !== b.questionType) return true;
  if (a.prompt !== b.prompt) return true;
  if (a.explanation !== b.explanation) return true;
  if (includeScore && a.score !== b.score) return true;
  if (a.singleAnswerIndex !== b.singleAnswerIndex) return true;
  if (a.essayReferenceAnswer !== b.essayReferenceAnswer) return true;
  if (a.shortAnswer !== b.shortAnswer) return true;
  if (a.answerFormat !== b.answerFormat) return true;
  if (
    JSON.stringify(a.referenceAnswerDocument) !==
    JSON.stringify(b.referenceAnswerDocument)
  )
    return true;
  if (
    JSON.stringify(a.explanationDocument) !==
    JSON.stringify(b.explanationDocument)
  )
    return true;
  if (a.options.length !== b.options.length) return true;
  if (a.options.some((o, i) => o !== b.options[i])) return true;
  if (a.multiAnswerIndexes.length !== b.multiAnswerIndexes.length) return true;
  if (a.multiAnswerIndexes.some((o, i) => o !== b.multiAnswerIndexes[i]))
    return true;
  return false;
};

// --- Preview helpers ---

/** Get the correct answer index for true_false / single_choice */
export const getCorrectSingleIndex = (question: ExamQuestion): number | null =>
  toAnswerIndex(
    question.correctAnswer,
    question.options,
    question.questionType,
  );

export const getCorrectMultiIndexes = (question: ExamQuestion): Set<number> =>
  new Set(toAnswerIndexes(question.correctAnswer, question.options));

export function getQuestionValidationError(
  form: QuestionFormState,
  opts: { requireScore: boolean },
): "invalidScore" | "minOptions" | "blankOption" | null {
  if (
    opts.requireScore &&
    (!Number.isFinite(Number(form.score || 0)) || Number(form.score || 0) <= 0)
  )
    return "invalidScore";
  if (!isChoiceType(form.questionType)) return null;
  if (form.options.length < 2) return "minOptions";
  if (form.options.some((option) => !option.trim())) return "blankOption";
  return null;
}

export function buildDuplicatePayload(
  source: ExamQuestion,
  order: number,
): ExamPaperQuestionPayload & {
  question_type: ExamQuestionType;
  prompt: string;
  score: number;
} {
  const payload: ExamPaperQuestionPayload & {
    question_type: ExamQuestionType;
    prompt: string;
    score: number;
  } = {
    question_type: source.questionType,
    prompt: source.prompt,
    explanation: source.explanation,
    score: source.score,
    order,
    answer_format: source.answerFormat,
  };
  if (source.options.length > 0) payload.options = [...source.options];
  if (source.correctAnswer != null)
    payload.correct_answer = Array.isArray(source.correctAnswer)
      ? [...source.correctAnswer]
      : source.correctAnswer;
  return payload;
}

export const DEFAULT_QUESTION_PAYLOADS: Record<
  ExamQuestionType,
  ExamPaperQuestionPayload & {
    question_type: ExamQuestionType;
    prompt: string;
    score: number;
  }
> = {
  // Choice questions start without a correct answer so a placeholder is never
  // mistaken for the real key; publishing warns about unset answers.
  single_choice: {
    question_type: "single_choice",
    prompt: DEFAULT_QUESTION_PROMPT,
    score: 5,
    options: [...DEFAULT_CHOICE_OPTIONS],
  },
  multiple_choice: {
    question_type: "multiple_choice",
    prompt: DEFAULT_QUESTION_PROMPT,
    score: 5,
    options: [...DEFAULT_CHOICE_OPTIONS],
  },
  true_false: {
    question_type: "true_false",
    prompt: DEFAULT_QUESTION_PROMPT,
    score: 5,
    options: ["True", "False"],
  },
  short_answer: {
    question_type: "short_answer",
    prompt: DEFAULT_QUESTION_PROMPT,
    score: 5,
  },
  essay: {
    question_type: "essay",
    prompt: DEFAULT_QUESTION_PROMPT,
    score: 5,
  },
};
