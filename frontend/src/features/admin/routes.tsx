import { Route } from "react-router";
import AnnouncementManagementScreen from "./screens/AnnouncementManagementScreen";
import LegacyContestBindingScreen from "./screens/LegacyContestBindingScreen";
import ReviewQueueScreen from "./screens/ReviewQueueScreen";
import UserManagementScreen from "./screens/UserManagementScreen";

export const adminRoutes = (
  <>
    <Route path="/system/users" element={<UserManagementScreen />} />
    <Route
      path="/management/announcements"
      element={<AnnouncementManagementScreen />}
    />
    <Route
      path="/admin/contest-bindings"
      element={<LegacyContestBindingScreen />}
    />
    <Route path="/admin/review-queue" element={<ReviewQueueScreen />} />
  </>
);
