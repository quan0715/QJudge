import type { ComponentType } from "react";
import {
  Boolean as BooleanIcon,
  Checkbox as CheckboxIcon,
  Document,
  Pen,
  RadioButton as RadioButtonIcon,
} from "@carbon/icons-react";
import type { ExamQuestionType } from "@/core/entities/contest.entity";

export const EXAM_QUESTION_TYPE_ICON: Record<
  ExamQuestionType,
  ComponentType<{ size?: number; className?: string }>
> = {
  single_choice: RadioButtonIcon,
  multiple_choice: CheckboxIcon,
  true_false: BooleanIcon,
  short_answer: Pen,
  essay: Document,
};

export const EXAM_QUESTION_TYPE_TAG_COLOR: Record<ExamQuestionType, string> = {
  true_false: "teal",
  single_choice: "blue",
  multiple_choice: "purple",
  short_answer: "cyan",
  essay: "magenta",
};
