import { lazy } from "react";
import { Route } from "react-router-dom";
import { RouteLoadingBoundary } from "@/shared/ui/RouteLoadingBoundary";

const UserManagementScreen = lazy(() => import("./screens/UserManagementScreen"));

export const adminRoutes = (
  <>
    <Route
      path="/system/users"
      element={
        <RouteLoadingBoundary>
          <UserManagementScreen />
        </RouteLoadingBoundary>
      }
    />
  </>
);
