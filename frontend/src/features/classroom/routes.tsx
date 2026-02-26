import { Route } from "react-router-dom";
import ClassroomListScreen from "./screens/ClassroomListScreen";
import ClassroomDetailScreen from "./screens/ClassroomDetailScreen";

/**
 * Classroom routes (RequireAuth + MainLayout)
 */
export const classroomRoutes = (
  <>
    <Route path="/classrooms" element={<ClassroomListScreen />} />
    <Route path="/classrooms/:classroomId" element={<ClassroomDetailScreen />} />
  </>
);
