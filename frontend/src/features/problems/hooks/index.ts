// Problem Hooks - Main exports

// List and filter hooks
export { useProblemList, type ProblemListFilters } from "./useProblemList";
export { useProblemTags } from "./useProblemTags";

// Problem detail hooks
export { ProblemProvider, useProblem } from "./useProblem";
export { useProblemDetail } from "./useProblemDetail";

// Solver hooks
export { useProblemSolver } from "./useProblemSolver";

// Re-export solver types from core
export type { ExecutionState, ResultMode } from "@/core/types/solver.types";

// Discussion hooks
export {
  useDiscussionList,
  useDiscussionDetail,
  discussionKeys,
} from "./useProblemDiscussions";

// Auto-save hook
export {
  useAutoSave,
  type FieldSaveStatus,
  type FieldSaveState,
  type GlobalSaveStatus as GlobalSaveStatusType,
  type UseAutoSaveOptions,
  type UseAutoSaveReturn,
} from "./useAutoSave";

// Scroll-spy hook - Re-export from shared for backward compatibility
export {
  useScrollSpy,
  type ScrollSpySection,
  type UseScrollSpyOptions,
  type UseScrollSpyReturn,
} from "@/shared/hooks/useScrollSpy";
