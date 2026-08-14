import { lazy } from "react";
import { Route } from "react-router-dom";
import { RouteLoadingBoundary } from "@/shared/ui/RouteLoadingBoundary";

const ClassroomDetailScreen = lazy(() => import("./screens/ClassroomDetailScreen"));

/**
 * Classroom Detail Route (RequireAuth + Standalone admin shell)
 */
export const classroomDetailRoute = (
  <>
    <Route
      path="/classrooms/:classroomId"
      element={
        <RouteLoadingBoundary>
          <ClassroomDetailScreen />
        </RouteLoadingBoundary>
      }
    />
  </>
);
