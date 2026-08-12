import { lazy } from "react";
import { Route } from "react-router";
import { RouteLoadingBoundary } from "@/shared/ui/RouteLoadingBoundary";

const ChangelogScreen = lazy(() => import("./screens/ChangelogScreen"));

export const changelogRoutes = (
  <Route
    path="/changelog"
    element={
      <RouteLoadingBoundary>
        <ChangelogScreen />
      </RouteLoadingBoundary>
    }
  />
);
