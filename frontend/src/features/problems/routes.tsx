import { lazy } from "react";
import { Route } from "react-router-dom";
import { RouteLoadingBoundary } from "@/shared/ui/RouteLoadingBoundary";
import ProblemLayout from "./components/layout/ProblemLayout";

const ProblemDetailScreen = lazy(() => import("./screens/problemsId"));
const ProblemSolveScreen = lazy(() => import("./screens/problemsIdSolve"));

/**
 * Problem Detail 路由（獨立 Layout，需在 RequireAuth 內使用）
 */
export const problemDetailRoutes = (
  <Route path="/problems/:id" element={<ProblemLayout />}>
    <Route
      index
      element={
        <RouteLoadingBoundary>
          <ProblemDetailScreen />
        </RouteLoadingBoundary>
      }
    />
  </Route>
);

/**
 * Problem Solve 路由（全螢幕 IDE 風格，需在 RequireAuth 內使用）
 */
export const problemSolveRoutes = (
  <Route
    path="/problems/:id/solve"
    element={
      <RouteLoadingBoundary>
        <ProblemSolveScreen />
      </RouteLoadingBoundary>
    }
  />
);
