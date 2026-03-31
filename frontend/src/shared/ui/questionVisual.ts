import type { ComponentType } from "react";
import { Code } from "@carbon/icons-react";
import type { ExamQuestionType } from "@/core/entities/contest.entity";
import type { BankQuestion, QuestionInboxItem } from "@/core/entities/question-bank.entity";
import { EXAM_QUESTION_TYPE_ICON } from "./examQuestionTypeVisual";

const EXAM_QUESTION_TYPE_SET = new Set<ExamQuestionType>([
  "single_choice",
  "multiple_choice",
  "true_false",
  "short_answer",
  "essay",
]);

export type QuestionVisualTone = "coding" | ExamQuestionType;
export type QuestionVisualToneMode = "colored" | "none";

export interface QuestionVisual {
  Icon: ComponentType<{ size?: number; className?: string }>;
  tone?: QuestionVisualTone;
}

export const resolveExamQuestionTypeFromRaw = (value?: string): ExamQuestionType | null => {
  if (!value) return null;
  return EXAM_QUESTION_TYPE_SET.has(value as ExamQuestionType)
    ? (value as ExamQuestionType)
    : null;
};

export const resolveExamQuestionTypeFromBankQuestion = (question: BankQuestion): ExamQuestionType => {
  const metadata =
    question.metadata && typeof question.metadata === "object"
      ? (question.metadata as Record<string, unknown>)
      : {};
  const direct = metadata.exam_question_type;
  if (typeof direct === "string" && EXAM_QUESTION_TYPE_SET.has(direct as ExamQuestionType)) {
    return direct as ExamQuestionType;
  }
  const legacy = metadata.legacy_question_type;
  if (typeof legacy === "string" && EXAM_QUESTION_TYPE_SET.has(legacy as ExamQuestionType)) {
    return legacy as ExamQuestionType;
  }
  if (Array.isArray(question.correctAnswer)) return "multiple_choice";
  if (typeof question.correctAnswer === "string" && question.options.length === 0) {
    return "short_answer";
  }
  return "single_choice";
};

export const getQuestionVisualFromBankQuestion = (
  question: BankQuestion,
  toneMode: QuestionVisualToneMode = "colored",
): QuestionVisual => {
  if (question.questionType === "coding") {
    return {
      Icon: Code,
      tone: toneMode === "colored" ? "coding" : undefined,
    };
  }
  const questionType = resolveExamQuestionTypeFromBankQuestion(question);
  return {
    Icon: EXAM_QUESTION_TYPE_ICON[questionType],
    tone: toneMode === "colored" ? questionType : undefined,
  };
};

export const getQuestionVisualFromInboxItem = (
  item: QuestionInboxItem,
  toneMode: QuestionVisualToneMode = "colored",
): QuestionVisual => {
  if (item.sourceType === "problem") {
    return {
      Icon: Code,
      tone: toneMode === "colored" ? "coding" : undefined,
    };
  }
  const questionType = resolveExamQuestionTypeFromRaw(item.questionType) || "essay";
  return {
    Icon: EXAM_QUESTION_TYPE_ICON[questionType],
    tone: toneMode === "colored" ? questionType : undefined,
  };
};
