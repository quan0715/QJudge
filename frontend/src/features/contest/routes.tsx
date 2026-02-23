import { Route, Navigate } from "react-router-dom";
import ContestListScreen from "./screens/ContestListScreen";
import ContestLayout from "./components/layout/ContestLayout";
import ContestDashboardScreen from "./screens/ContestDashboardScreen";
import ContestProblemScreen from "./screens/ContestProblemScreen";
import {
  ExamV2RegistrationScreen,
  ExamV2PrecheckScreen,
  ExamV2AnsweringScreen,
  ExamV2SubmitReviewScreen,
  ExamV2GradingScreen,
  ExamV2ResultScreen,
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
    {/* Exam v2 Flow (API-connected student flow) */}
    <Route path="exam-v2" element={<Navigate to="registration" replace />} />
    <Route path="exam-v2/registration" element={<ExamV2RegistrationScreen />} />
    <Route path="exam-v2/precheck" element={<ExamV2PrecheckScreen />} />
    <Route path="exam-v2/answering" element={<ExamV2AnsweringScreen />} />
    <Route path="exam-v2/submit-review" element={<ExamV2SubmitReviewScreen />} />
    <Route path="exam-v2/grading" element={<ExamV2GradingScreen />} />
    <Route path="exam-v2/result" element={<ExamV2ResultScreen />} />
  </Route>
);
