import { Route } from "react-router-dom";
import DashboardScreen from "./screens/DashboardScreen";

/**
 * Dashboard 路由（需在 RequireAuth + MainLayout 內使用）
 */
export const dashboardRoute = (
  <Route path="/dashboard" element={<DashboardScreen />} />
);
