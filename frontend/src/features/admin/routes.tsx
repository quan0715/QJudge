import { lazy } from "react";
import { Route } from "react-router";
import { RouteLoadingBoundary } from "@/shared/ui/RouteLoadingBoundary";

const UserManagementScreen = lazy(() => import("./screens/UserManagementScreen"));
const DraftProblemsScreen = lazy(() => import("./screens/DraftProblemsScreen"));

export const draftProblemsRoute = (
  <Route
    path="/drafts"
    element={
      <RouteLoadingBoundary>
        <DraftProblemsScreen />
      </RouteLoadingBoundary>
    }
  />
);

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
