import { lazy, Suspense } from "react";
import { Route } from "react-router";

const AnnouncementManagementScreen = lazy(() => import("./screens/AnnouncementManagementScreen"));
const ReviewQueueScreen = lazy(() => import("./screens/ReviewQueueScreen"));
const UserManagementScreen = lazy(() => import("./screens/UserManagementScreen"));
const DraftProblemsScreen = lazy(() => import("./screens/DraftProblemsScreen"));

export const draftProblemsRoute = (
  <Route path="/drafts" element={<Suspense fallback={null}><DraftProblemsScreen /></Suspense>} />
);

export const adminRoutes = (
  <>
    <Route path="/system/users" element={<Suspense fallback={null}><UserManagementScreen /></Suspense>} />
    <Route
      path="/management/announcements"
      element={<Suspense fallback={null}><AnnouncementManagementScreen /></Suspense>}
    />
    <Route path="/admin/review-queue" element={<Suspense fallback={null}><ReviewQueueScreen /></Suspense>} />
  </>
);
