import { Route } from "react-router-dom";
import ClassroomDetailScreen from "./screens/ClassroomDetailScreen";

/**
 * Classroom Detail Route (RequireAuth + Standalone admin shell)
 */
export const classroomDetailRoute = (
  <>
    <Route path="/classrooms/:classroomId" element={<ClassroomDetailScreen />} />
  </>
);
