import { lazy } from "react";
import { Route } from "react-router-dom";
import { RouteLoadingBoundary } from "@/shared/ui/RouteLoadingBoundary";

const DocumentationScreen = lazy(() => import("./screens/DocumentationScreen"));

export const docsRoutes = (
  <Route
    path="/docs/*"
    element={<RouteLoadingBoundary><DocumentationScreen /></RouteLoadingBoundary>}
  />
);
