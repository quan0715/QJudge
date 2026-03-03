import type { ContestDetail, ContestType } from "@/core/entities/contest.entity";
import type { ContestTabKey } from "@/features/contest/tabConfig";

export type AdminPanelId =
  | "overview"
  | "logs"
  | "participants"
  | "exam"
  | "grading"
  | "settings";

export type ContestStudentProblemsViewKind = "coding" | "paper_exam";
export type ContestAdminExamEditorKind = "coding" | "paper_exam";
export type ContestAdminExportProfile = "coding" | "paper_exam";

export interface ContestStudentModule {
  problemsViewKind: ContestStudentProblemsViewKind;
  getAvailableTabs: (contest?: ContestDetail | null) => ContestTabKey[];
}

export interface ContestAdminModule {
  examEditorKind: ContestAdminExamEditorKind;
  exportProfile: ContestAdminExportProfile;
  shouldShowExamJsonActions: (activePanel: AdminPanelId) => boolean;
}

export interface ContestTypeModule {
  type: ContestType;
  student: ContestStudentModule;
  admin: ContestAdminModule;
}
