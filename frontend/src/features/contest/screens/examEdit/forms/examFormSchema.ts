import type { ContestStatus, ContestVisibility } from "@/core/entities/contest.entity";

export interface ExamFormSchema {
  // Basic info
  name: string;
  description: string;
  rules: string;
  startTime: string;
  endTime: string;
  status: ContestStatus;
  visibility: ContestVisibility;
  password: string;
  // Exam settings
  examModeEnabled: boolean;
  maxCheatWarnings: number;
  allowMultipleJoins: boolean;
  allowAutoUnlock: boolean;
  autoUnlockMinutes: number;
}

export const DEFAULT_EXAM_FORM_VALUES: ExamFormSchema = {
  name: "",
  description: "",
  rules: "",
  startTime: "",
  endTime: "",
  status: "draft",
  visibility: "public",
  password: "",
  examModeEnabled: false,
  maxCheatWarnings: 3,
  allowMultipleJoins: false,
  allowAutoUnlock: false,
  autoUnlockMinutes: 5,
};
