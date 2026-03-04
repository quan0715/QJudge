import type { ReactNode } from "react";
import type { ContestDetail, ContestType, ScoreboardRow } from "@/core/entities/contest.entity";
import type { ContestTabSpec } from "@/features/contest/tabConfig";

export type AdminPanelId =
  | "overview"
  | "clarifications"
  | "logs"
  | "participants"
  | "problem_editor"
  | "grading"
  | "statistics"
  | "settings";

export type ContestAdminEditorKind = "coding" | "paper_exam";
export type ContestStudentTabContentKind =
  | "overview"
  | "coding_problems"
  | "paper_exam_problems"
  | "submissions"
  | "standings"
  | "clarifications";

export interface ContestStudentTabDefinition extends ContestTabSpec {
  contentKind: ContestStudentTabContentKind;
}

export interface ContestStudentTabRenderContext {
  contest: ContestDetail;
  myRank: ScoreboardRow | null;
  maxWidth: string;
}

export type ContestStudentTabRenderer = (
  context: ContestStudentTabRenderContext,
) => ReactNode;
export type ContestExportTarget =
  | "exam-question"
  | "exam-answer"
  | "exam-json"
  | "coding-pdf"
  | "coding-markdown";

export interface ContestStudentModule {
  getTabs: (contest?: ContestDetail | null) => ContestStudentTabDefinition[];
  getTabRenderers?: () => Partial<
    Record<ContestStudentTabContentKind, ContestStudentTabRenderer>
  >;
  getAnsweringEntryPath: (
    contestId: string,
    contest?: ContestDetail | null,
  ) => string;
}

export interface ContestAdminModule {
  editorKind: ContestAdminEditorKind;
  getAvailablePanels: (contest?: ContestDetail | null) => AdminPanelId[];
  getExportTargets: (contest?: ContestDetail | null) => ContestExportTarget[];
  shouldShowJsonActions: (activePanel: AdminPanelId) => boolean;
}

export interface ContestTypeModule {
  type: ContestType;
  student: ContestStudentModule;
  admin: ContestAdminModule;
}
