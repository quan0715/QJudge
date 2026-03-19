import { Route } from "react-router";
import { Navigate } from "react-router-dom";
import ContestListScreen from "./screens/ContestListScreen";
import ContestLayout from "./components/layout/ContestLayout";
import { ContestProvider } from "./contexts/ContestContext";
import ContestDashboardScreen from "./screens/ContestDashboardScreen";
import ContestSolveScreen from "./screens/ContestSolveScreen";
import AdminDashboardScreen from "./screens/admin/AdminDashboardScreen";
import StudentExamDemoScreen from "./screens/examDemo/StudentExamDemoScreen";
import {
  ExamPrecheckScreen,
} from "./screens/paperExam";

/**
 * Contest List 路由（需在 RequireAuth + MainLayout 內使用）
 */
export const contestListRoute = (
  <Route path="/contests" element={<ContestListScreen />} />
);

/**
 * Contest Detail 路由（需在 RequireAuth 內使用，有獨立 Layout）
 */
export const contestDetailRoutes = (
  <Route path="/contests/:contestId" element={<ContestLayout />}>
    <Route index element={<ContestDashboardScreen />} />
    {/* Legacy route redirects to new query param structure */}
    <Route path="problems" element={<Navigate to="../?tab=problems" replace />} />
    <Route path="submissions" element={<Navigate to="../?tab=submissions" replace />} />
    <Route path="standings" element={<Navigate to="../?tab=standings" replace />} />
    <Route path="clarifications" element={<Navigate to="../?tab=clarifications" replace />} />
    {/* Unified solving entry */}
    <Route path="solve" element={<ContestSolveScreen />} />
    <Route path="solve/:problemId" element={<ContestSolveScreen />} />
  </Route>
);

/**
 * Contest Admin Dashboard — 獨立全頁面，TA/Admin 儀表板
 */
export const contestAdminRoute = (
  <Route
    path="/contests/:contestId/admin"
    element={<AdminDashboardScreen />}
  />
);

/**
 * Exam Preview — 獨立全頁面，管理者預覽學生作答畫面（Demo 模式）
 */
export const examPreviewRoute = (
  <Route
    path="/contests/:contestId/exam-preview"
    element={<StudentExamDemoScreen />}
  />
);

/**
 * Exam Precheck — 獨立全頁面，不限 contestType
 * coding / paper_exam 開啟防作弊時都經過此頁面
 */
export const examPrecheckRoute = (
  <Route
    path="/contests/:contestId/exam-precheck"
    element={
      <ContestProvider>
        <ExamPrecheckScreen />
      </ContestProvider>
    }
  />
);
