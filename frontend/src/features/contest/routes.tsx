import { lazy } from "react";
import { Route } from "react-router";
import { RouteLoadingBoundary } from "@/shared/ui/RouteLoadingBoundary";
import RuntimeRouteWrapper from "./components/layout/RuntimeRouteWrapper";
import { ContestProvider } from "./contexts/ContestContext";

const ContestDashboardScreen = lazy(() => import("./screens/ContestDashboardScreen"));
const ContestSolveScreen = lazy(() => import("./screens/ContestSolveScreen"));
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
    <Route
      index
      element={
        <RouteLoadingBoundary>
          <ContestDashboardScreen />
        </RouteLoadingBoundary>
      }
    />
    <Route
      path="solve"
      element={
        <RuntimeRouteWrapper>
          <RouteLoadingBoundary>
            <ContestSolveScreen />
          </RouteLoadingBoundary>
        </RuntimeRouteWrapper>
      }
    />
    <Route
      path="solve/:problemId"
      element={
        <RuntimeRouteWrapper>
          <RouteLoadingBoundary>
            <ContestSolveScreen />
          </RouteLoadingBoundary>
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
    element={
      <RouteLoadingBoundary>
        <AdminDashboardScreen />
      </RouteLoadingBoundary>
    }
  />
);

export const classroomContestAttendanceProjectionRoute = (
  <Route
    path="/classrooms/:classroomId/contest/:contestId/admin/attendance/projection"
    element={
      <ContestProvider>
        <RouteLoadingBoundary>
          <AttendanceProjectionScreen />
        </RouteLoadingBoundary>
      </ContestProvider>
    }
  />
);

export const classroomContestAttendanceScanRoute = (
  <Route
    path="/classrooms/:classroomId/contest/:contestId/attendance/scan"
    element={
      <RouteLoadingBoundary>
        <StudentAttendanceScanScreen />
      </RouteLoadingBoundary>
    }
  />
);

/**
 * Classroom Exam Preview — 獨立全頁面
 */
export const classroomExamPreviewRoute = (
  <Route
    path="/classrooms/:classroomId/contest/:contestId/exam-preview"
    element={
      <RouteLoadingBoundary>
        <StudentExamDemoScreen />
      </RouteLoadingBoundary>
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
        <RouteLoadingBoundary>
          <ExamPrecheckScreen />
        </RouteLoadingBoundary>
      </ContestProvider>
    }
  />
);
