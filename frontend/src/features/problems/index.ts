// Problems Feature - Main exports
// Screen folders use camelCase route segments:
// - /problems -> screens/problems/
// - /problems/:id -> screens/problemsId/
// - /problems/:id/edit -> screens/problemsIdEdit/
// - /problems/:id/solve -> screens/problemsIdSolve/

// Routes
export {
  problemRoutes,
  problemDetailRoutes,
  problemSolveRoutes,
  problemEditRoutes,
} from "./routes";

// Screens
export {
  ProblemListScreen,
  ProblemDetailScreen,
  ProblemEditScreen,
  ProblemSolveScreen,
} from "./screens";

// Components (shared across screens and other features)
export * from "./components";

// Hooks
export * from "./hooks";

// Constants
export * from "./constants/codeTemplates";

// Forms
export * from "./forms/problemFormSchema";
export * from "./forms/problemFormAdapters";
