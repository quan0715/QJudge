import type { ReactNode } from "react";
import type { ContestDetail, ContestType } from "@/core/entities/contest.entity";
import type { Params } from "react-router-dom";

export type AdminPanelId =
  | "overview"
  | "clarifications"
  | "proctoring"
  | "problem_editor"
  | "grading"
  | "standings"
  | "ai-grading"
  | "statistics"
  | "settings";

export type ContestSettingsSectionId =
  | "general"
  | "access"
  | "display"
  | "cheatDetection";

export type ContestAdminEditorKind = "coding" | "paper_exam";
export interface ContestSolveRenderContext {
  contestId: string;
  contest: ContestDetail | null;
  params: Readonly<Params<string>>;
  query: URLSearchParams;
}

export type ContestSolveRenderer = (
  context: ContestSolveRenderContext,
) => ReactNode;

export interface AdminPanelProps {
  contestId: string;
  contest: ContestDetail | null;
  onExport?: () => void;
  onPreview?: () => void;
  onOpenSettings?: (section?: ContestSettingsSectionId) => void;
}

export type AdminPanelRenderer = React.ComponentType<AdminPanelProps>;

export type ContestExportTarget =
  | "exam-question"
  | "exam-answer"
  | "coding-pdf"
  | "coding-markdown";

export interface ContestStudentModule {
  getSolveRenderer: () => ContestSolveRenderer;
  getAnsweringEntryPath: (
    contestId: string,
    contest?: ContestDetail | null,
  ) => string;
}

export interface ContestAdminModule {
  editorKind: ContestAdminEditorKind;
  getAvailablePanels: (contest?: ContestDetail | null) => AdminPanelId[];
  getPanelRenderers?: () => Partial<Record<AdminPanelId, AdminPanelRenderer>>;
  getExportTargets: (contest?: ContestDetail | null) => ContestExportTarget[];
}

export interface ContestTypeModule {
  type: ContestType;
  student: ContestStudentModule;
  admin: ContestAdminModule;
}
