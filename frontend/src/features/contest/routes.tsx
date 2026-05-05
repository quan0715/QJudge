import { lazy, Suspense } from "react";
import { Route } from "react-router";
import ContestWorkspaceLayout from "./components/layout/ContestWorkspaceLayout";
import RuntimeRouteWrapper from "./components/layout/RuntimeRouteWrapper";
import { ContestProvider } from "./contexts/ContestContext";
import ContestDashboardScreen from "./screens/ContestDashboardScreen";
import ContestSolveScreen from "./screens/ContestSolveScreen";
import ContestPracticeScreen from "./screens/ContestPracticeScreen";

const AdminDashboardScreen = lazy(() => import("./screens/admin/AdminDashboardScreen"));
const StudentExamDemoScreen = lazy(() => import("./screens/examDemo/StudentExamDemoScreen"));
const ExamPrecheckScreen = lazy(() => import("./screens/paperExam/ExamPrecheckScreen"));

// ── Classroom-scoped contest routes (/classrooms/:classroomId/contest/:contestId) ──

/**
 * Classroom Contest 主路由（dashboard + runtime 共用同一條 layout 軌道）。
 * 在 App.tsx 必須掛在 <MainLayout> 之下。
 * Runtime 子路由包在 <RuntimeRouteWrapper> 裡，啟動 ExamModeWrapper / 監考 modal /
 * 關閉右側 chat panel / 提供 ContestRuntimeContext。
 */
export const classroomContestRoutes = (
  <Route path="/classrooms/:classroomId/contest/:contestId" element={<ContestWorkspaceLayout />}>
    <Route index element={<ContestDashboardScreen />} />
    <Route
      path="solve"
      element={
        <RuntimeRouteWrapper>
          <ContestSolveScreen />
        </RuntimeRouteWrapper>
      }
    />
    <Route
      path="solve/:problemId"
      element={
        <RuntimeRouteWrapper>
          <ContestSolveScreen />
        </RuntimeRouteWrapper>
      }
    />
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
