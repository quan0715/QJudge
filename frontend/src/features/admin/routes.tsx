import { Route } from "react-router";
import AnnouncementManagementScreen from "./screens/AnnouncementManagementScreen";
import ReviewQueueScreen from "./screens/ReviewQueueScreen";
import UserManagementScreen from "./screens/UserManagementScreen";
import DraftProblemsScreen from "./screens/DraftProblemsScreen";

export const draftProblemsRoute = (
  <Route path="/drafts" element={<DraftProblemsScreen />} />
);

export const adminRoutes = (
  <>
    <Route path="/system/users" element={<UserManagementScreen />} />
    <Route
      path="/management/announcements"
      element={<AnnouncementManagementScreen />}
    />
    <Route path="/admin/review-queue" element={<ReviewQueueScreen />} />
  </>
);
