import { Route } from "react-router";
import AnnouncementManagementScreen from "./screens/AnnouncementManagementScreen";
import UserManagementScreen from "./screens/UserManagementScreen";

export const adminRoutes = (
  <>
    <Route path="/system/users" element={<UserManagementScreen />} />
    <Route
      path="/management/announcements"
      element={<AnnouncementManagementScreen />}
    />
  </>
);
