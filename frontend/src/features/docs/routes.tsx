import { lazy } from "react";
import { Route } from "react-router";
import { RouteLoadingBoundary } from "@/shared/ui/RouteLoadingBoundary";

const DocumentationScreen = lazy(() => import("./screens/DocumentationScreen"));

const documentationScreen = (
  <RouteLoadingBoundary>
    <DocumentationScreen />
  </RouteLoadingBoundary>
);

/**
 * Documentation 路由（需在 DocsLayout 內使用，公開不需登入）
 */
export const docsRoutes = (
  <>
    <Route path="/docs" element={documentationScreen} />
    <Route path="/docs/:slug" element={documentationScreen} />
  </>
);
