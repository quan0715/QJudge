/**
 * Shared Solver UI Components
 * 
 * 通用的解題介面元件，可被 features/contest 和 features/problems 共用
 */

// Editor
export { EditorContent } from "./editor";
export { LanguageSelector, type LanguageOption } from "./editor";

// Statement
export { StatementPanel } from "./statement";

// Result
export { ResultPanel } from "./result/ResultPanel";
export { ResultToolbar } from "./result/ResultToolbar";
export { ResultsPanel, TEST_CASE_SIDEBAR_LABELS } from "./result/execution";
export { TestResultHeader } from "./result/execution";
export { TestCaseResultDetail } from "./result/execution";
export { EditTestCasesPanel } from "./result/testcases";
export { TestCaseDetail } from "./result/testcases";
export type { CaseResultDisplay, HeaderInfo } from "./result/execution/utils";

// Menu
export { ProblemMenu, type ProblemMenuItem } from "./menu";

// Re-export types from core
export type { ResultMode, ExecutionState, ExecutionStatus, ExecutionType } from "@/core/types/solver.types";
export type { TestCaseItem } from "@/core/entities/testcase.entity";
