import { Route } from "react-router-dom";
import AnnouncementManagementScreen from "./screens/AnnouncementManagementScreen";
import EnvironmentScreen from "./screens/EnvironmentScreen";
import UserManagementScreen from "./screens/UserManagementScreen";

export const adminRoutes = (
  <>
    <Route path="/system/users" element={<UserManagementScreen />} />
    <Route path="/system/environment" element={<EnvironmentScreen />} />
    <Route
      path="/management/announcements"
      element={<AnnouncementManagementScreen />}
    />
  </>
);
