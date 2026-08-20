import { lazy } from "react";
import { Route } from "react-router-dom";
import { RouteLoadingBoundary } from "@/shared/ui/RouteLoadingBoundary";

const LandingScreen = lazy(() => import("./screens/LandingScreen"));

/**
 * Public landing route (no auth required)
 * This is the default homepage for unauthenticated users
 */
export const landingRoute = (
  <Route
    path="/"
    element={
      <RouteLoadingBoundary>
        <LandingScreen />
      </RouteLoadingBoundary>
    }
  />
);
