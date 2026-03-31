import { Route } from "react-router-dom";
import ClassroomDetailScreen from "./screens/ClassroomDetailScreen";
import ClassroomJoinScreen from "./screens/ClassroomJoinScreen";

/**
 * Classroom Detail Route (RequireAuth + Standalone admin shell)
 */
export const classroomDetailRoute = (
  <>
    <Route path="/classrooms/:classroomId" element={<ClassroomDetailScreen />} />
  </>
);

/**
 * Classroom Join Route — link-based invitation landing page
 */
export const classroomJoinRoute = (
  <Route path="/classrooms/join/:code" element={<ClassroomJoinScreen />} />
);
