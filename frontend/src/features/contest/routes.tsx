import { lazy, Suspense } from "react";
import { Route } from "react-router";
import ContestLayout from "./components/layout/ContestLayout";
import { ContestProvider } from "./contexts/ContestContext";
import ContestDashboardScreen from "./screens/ContestDashboardScreen";
import ContestSolveScreen from "./screens/ContestSolveScreen";
import ContestPracticeScreen from "./screens/ContestPracticeScreen";

const AdminDashboardScreen = lazy(() => import("./screens/admin/AdminDashboardScreen"));
const StudentExamDemoScreen = lazy(() => import("./screens/examDemo/StudentExamDemoScreen"));
const ExamPrecheckScreen = lazy(() => import("./screens/paperExam/ExamPrecheckScreen"));

// ── Classroom-scoped contest routes (/classrooms/:classroomId/contest/:contestId) ──

/**
 * Classroom Contest Detail 路由（需在 RequireAuth 內使用，有獨立 Layout）
 */
export const classroomContestDetailRoutes = (
  <Route path="/classrooms/:classroomId/contest/:contestId" element={<ContestLayout />}>
    <Route index element={<ContestDashboardScreen />} />
    <Route path="solve" element={<ContestSolveScreen />} />
    <Route path="solve/:problemId" element={<ContestSolveScreen />} />
  </Route>
);

/**
 * Classroom Contest Admin Dashboard — 獨立全頁面
 */
export const classroomContestAdminRoute = (
  <Route
    path="/classrooms/:classroomId/contest/:contestId/admin"
    element={<Suspense fallback={null}><AdminDashboardScreen /></Suspense>}
  />
);

/**
 * Classroom Exam Preview — 獨立全頁面
 */
export const classroomExamPreviewRoute = (
  <Route
    path="/classrooms/:classroomId/contest/:contestId/exam-preview"
    element={<Suspense fallback={null}><StudentExamDemoScreen /></Suspense>}
  />
);

/**
 * Classroom Practice — 獨立全頁面（同 /solve 但不記錄提交）
 */
export const classroomPracticeRoute = (
  <Route
    path="/classrooms/:classroomId/contest/:contestId/practice"
    element={
      <ContestProvider>
        <ContestPracticeScreen />
      </ContestProvider>
    }
  />
);

/**
 * Classroom Exam Precheck — 獨立全頁面
 */
export const classroomExamPrecheckRoute = (
  <Route
    path="/classrooms/:classroomId/contest/:contestId/exam-precheck"
    element={
      <ContestProvider>
        <Suspense fallback={null}><ExamPrecheckScreen /></Suspense>
      </ContestProvider>
    }
  />
);
