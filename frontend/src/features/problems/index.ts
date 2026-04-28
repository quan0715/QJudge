// Problems Feature - Main exports
// Only export what App.tsx route tree actually needs.
// Internal consumers and cross-feature imports should use deep paths
// (e.g., "@/features/problems/hooks", "@/features/problems/forms/problemFormSchema").

export {
  problemDetailRoutes,
  problemSolveRoutes,
} from "./routes";
