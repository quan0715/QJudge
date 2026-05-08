import { lazy, Suspense } from "react";
import { Route } from "react-router";
import RuntimeRouteWrapper from "./components/layout/RuntimeRouteWrapper";
import { ContestProvider } from "./contexts/ContestContext";
import ContestDashboardScreen from "./screens/ContestDashboardScreen";
import ContestSolveScreen from "./screens/ContestSolveScreen";
import ContestPracticeScreen from "./screens/ContestPracticeScreen";

const AdminDashboardScreen = lazy(() => import("./screens/admin/AdminDashboardScreen"));
const AttendanceProjectionScreen = lazy(() => import("./screens/admin/attendance/AttendanceProjectionScreen"));
const StudentAttendanceScanScreen = lazy(() => import("./screens/attendance/StudentAttendanceScanScreen"));
const StudentExamDemoScreen = lazy(() => import("./screens/examDemo/StudentExamDemoScreen"));
const ExamPrecheckScreen = lazy(() => import("./screens/paperExam/ExamPrecheckScreen"));

// ── Classroom-scoped contest routes (/classrooms/:classroomId/contest/:contestId) ──

/**
 * Classroom Contest 主路由 children（dashboard + runtime 共用同一條 layout 軌道）。
 * App.tsx 會把這段放在 ContestWorkspaceLayout -> MainLayout 之下，讓 WorkspaceShell
 * 的 top nav / side menu 也能讀到 ContestProvider。
 */
export const classroomContestRouteChildren = (
  <>
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
  </>
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

export const classroomContestAttendanceProjectionRoute = (
  <Route
    path="/classrooms/:classroomId/contest/:contestId/admin/attendance/projection"
    element={
      <ContestProvider>
        <Suspense fallback={null}><AttendanceProjectionScreen /></Suspense>
      </ContestProvider>
    }
  />
);

export const classroomContestAttendanceScanRoute = (
  <Route
    path="/classrooms/:classroomId/contest/:contestId/attendance/scan"
    element={<Suspense fallback={null}><StudentAttendanceScanScreen /></Suspense>}
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
