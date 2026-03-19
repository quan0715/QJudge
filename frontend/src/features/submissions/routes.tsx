import { Route } from "react-router";
import { SubmissionsScreen } from "./screens/submissions";

/**
 * Submissions 路由（需在 RequireAuth + MainLayout 內使用）
 */
export const submissionRoutes = (
  <Route path="/submissions" element={<SubmissionsScreen />} />
);
