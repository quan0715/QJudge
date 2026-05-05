// Contest Feature - Main exports
// Only export what App.tsx route tree actually needs.
// Internal consumers should import from deep paths
// (e.g., "@/features/contest/contexts") instead of this barrel.

export {
  classroomContestDetailRoutes,
  classroomContestRuntimeRoutes,
  classroomContestAdminRoute,
  classroomExamPreviewRoute,
  classroomExamPrecheckRoute,
  classroomPracticeRoute,
} from "./routes";
