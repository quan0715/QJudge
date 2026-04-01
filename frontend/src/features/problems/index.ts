// Problems Feature - Main exports
// Screen folders use camelCase route segments:
// - /problems -> screens/problems/
// - /problems/:id -> screens/problemsId/
// - /problems/:id/solve -> screens/problemsIdSolve/

// Routes
export {
  problemDetailRoutes,
  problemSolveRoutes,
} from "./routes";

// Screens
export {
  ProblemListScreen,
  ProblemDetailScreen,
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
