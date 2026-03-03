import type { ContestDetail, ContestType } from "@/core/entities/contest.entity";
import type { ContestTabSpec } from "@/features/contest/tabConfig";

export type AdminPanelId =
  | "overview"
  | "logs"
  | "participants"
  | "exam"
  | "grading"
  | "settings";

export type ContestStudentProblemsViewKind = "coding" | "paper_exam";
export type ContestAdminEditorKind = "coding" | "paper_exam";
export type ContestExportTarget =
  | "exam-question"
  | "exam-answer"
  | "exam-json"
  | "coding-pdf"
  | "coding-markdown";

export interface ContestStudentModule {
  problemsViewKind: ContestStudentProblemsViewKind;
  getTabs: (contest?: ContestDetail | null) => ContestTabSpec[];
  getAnsweringEntryPath: (
    contestId: string,
    contest?: ContestDetail | null,
  ) => string;
}

export interface ContestAdminModule {
  editorKind: ContestAdminEditorKind;
  getExportTargets: (contest?: ContestDetail | null) => ContestExportTarget[];
  shouldShowJsonActions: (activePanel: AdminPanelId) => boolean;
}

export interface ContestTypeModule {
  type: ContestType;
  student: ContestStudentModule;
  admin: ContestAdminModule;
}
