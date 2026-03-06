import type {
  ExamStatusType,
  ExamQuestionType,
} from "@/core/entities/contest.entity";
import i18n from "i18next";

/**
 * Static fallback labels (used in non-React contexts or before i18n is ready).
 * Prefer using the i18n-aware getters below whenever possible.
 */
export const QUESTION_TYPE_LABELS: Record<ExamQuestionType, string> = {
  true_false: "是非題",
  single_choice: "單選題",
  multiple_choice: "多選題",
  short_answer: "簡答題",
  essay: "問答題",
};

export const EXAM_STATUS_LABELS: Record<ExamStatusType, string> = {
  not_started: "未開始",
  in_progress: "進行中",
  paused: "已暫停",
  locked: "已鎖定",
  locked_takeover: "接管鎖定",
  submitted: "已交卷",
};

export function getQuestionTypeLabel(type: ExamQuestionType): string {
  return i18n.t(`contest:questionTypes.${type}`, QUESTION_TYPE_LABELS[type]);
}

export function getExamStatusLabel(status: ExamStatusType): string {
  return i18n.t(`contest:examStatus.${status}`, EXAM_STATUS_LABELS[status]);
}
