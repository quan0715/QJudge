import { lazy } from "react";
import { Route } from "react-router-dom";
import { RouteLoadingBoundary } from "@/shared/ui/RouteLoadingBoundary";

const DashboardScreen = lazy(() => import("./screens/DashboardScreen"));

/**
 * Dashboard 路由（需在 RequireAuth + MainLayout 內使用）
 */
export const dashboardRoute = (
  <Route
    path="/dashboard"
    element={
      <RouteLoadingBoundary>
        <DashboardScreen />
      </RouteLoadingBoundary>
    }
  />
);
