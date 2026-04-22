import type { ReactNode } from "react";
import type { ContestDetail, ContestType, ScoreboardRow } from "@/core/entities/contest.entity";
import type { ContestTabSpec } from "@/features/contest/tabConfig";
import type { Params } from "react-router-dom";

export type AdminPanelId =
  | "overview"
  | "clarifications"
  | "logs"
  | "participants"
  | "problem_editor"
  | "grading"
  | "ai-grading"
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
  onOpenSettings?: () => void;
}

export type AdminPanelRenderer = React.ComponentType<AdminPanelProps>;

export type ContestExportTarget =
  | "exam-question"
  | "exam-answer"
  | "coding-pdf"
  | "coding-markdown";

export interface ContestStudentModule {
  getTabs: (contest?: ContestDetail | null) => ContestStudentTabDefinition[];
  getTabRenderers?: () => Partial<
    Record<ContestStudentTabContentKind, ContestStudentTabRenderer>
  >;
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
