import { Route } from "react-router-dom";
import {
  TeacherProblemsScreen,
  TeacherContestsScreen,
  TeacherDashboardScreen,
} from "./screens";

export const teacherRoutes = (
  <>
    <Route path="/teacher" element={<TeacherDashboardScreen />} />
    <Route path="/teacher/problems" element={<TeacherProblemsScreen />} />
    <Route path="/teacher/contests" element={<TeacherContestsScreen />} />
  </>
);
