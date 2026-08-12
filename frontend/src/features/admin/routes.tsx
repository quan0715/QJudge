import { lazy } from "react";
import { Route } from "react-router";
import { RouteLoadingBoundary } from "@/shared/ui/RouteLoadingBoundary";

const AnnouncementManagementScreen = lazy(() => import("./screens/AnnouncementManagementScreen"));
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
    <Route
      path="/management/announcements"
      element={
        <RouteLoadingBoundary>
          <AnnouncementManagementScreen />
        </RouteLoadingBoundary>
      }
    />
  </>
);
