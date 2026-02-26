import { Route, Navigate } from "react-router-dom";
import ContestListScreen from "./screens/ContestListScreen";
import ContestLayout from "./components/layout/ContestLayout";
import ExamV2Layout from "./components/layout/ExamV2Layout";
import ContestDashboardScreen from "./screens/ContestDashboardScreen";
import ContestProblemScreen from "./screens/ContestProblemScreen";
import ExamEditScreen from "./screens/examEdit/ExamEditScreen";
import {
  ExamV2PrecheckScreen,
  ExamV2AnsweringScreen,
  ExamV2SubmitReviewScreen,
  ExamV2GradingScreen,
  ExamV2ResultScreen,
  StudentExamDemoScreen,
} from "./screens";

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
    {/* Problem Solving Page */}
    <Route path="solve/:problemId" element={<ContestProblemScreen />} />
    {/* Exam Edit Page (admin/teacher only) */}
    <Route path="exam/edit" element={<ExamEditScreen />} />
  </Route>
);

/**
 * Exam v2 Flow — 獨立全頁面，不嵌套在 ContestLayout 內
 * 使用 ExamV2Layout 提供 ContestContext
 */
export const examV2Routes = (
  <Route path="/contests/:contestId/exam-v2" element={<ExamV2Layout />}>
    <Route index element={<Navigate to="precheck" replace />} />
    <Route path="precheck" element={<ExamV2PrecheckScreen />} />
    <Route path="answering" element={<ExamV2AnsweringScreen />} />
    <Route path="submit-review" element={<ExamV2SubmitReviewScreen />} />
    <Route path="grading" element={<ExamV2GradingScreen />} />
    <Route path="result" element={<ExamV2ResultScreen />} />
  </Route>
);

/**
 * Student Exam Demo — 獨立全頁面，不嵌套在 ContestLayout 內
 */
export const examDemoRoute = (
  <Route
    path="/contests/:contestId/exam-demo"
    element={<StudentExamDemoScreen />}
  />
);
