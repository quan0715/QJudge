// Problem Hooks - Main exports

// Solver hooks
export { useProblemSolver } from "./useProblemSolver";

// Re-export solver types from core
export type { ExecutionState, ResultMode } from "@/core/types/solver.types";

// Auto-save hook
export {
  useAutoSave,
  type FieldSaveStatus,
  type FieldSaveState,
  type GlobalSaveStatus as GlobalSaveStatusType,
  type UseAutoSaveOptions,
  type UseAutoSaveReturn,
} from "./useAutoSave";
